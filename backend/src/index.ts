import crypto from "crypto";
import { createServer } from "http";
import express from "express";
import { WebSocket, WebSocketServer } from "ws";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { AppointmentStatus, Role, UserStatus } from "@prisma/client";
import { config } from "./config";
import { prisma } from "./lib/prisma";
import { verifyAccessToken } from "./lib/tokens";
import { queueEvents } from "./lib/queue-events";
import { resolveTenant } from "./middleware/tenant";
import { errorHandler, notFound } from "./middleware/error";
import authRoutes from "./modules/auth/auth.routes";
import adminRoutes from "./modules/admin/admin.routes";
import appointmentRoutes from "./modules/appointments/appointments.routes";
import billingRoutes from "./modules/billing/billing.routes";
import billingOperationsRoutes from "./modules/billing/operations.routes";
import receptionRoutes from "./modules/reception/reception.routes";
import clinicalRoutes from "./modules/clinical/clinical.routes";
import prescriptionRoutes from "./modules/clinical/prescriptions.routes";
import investigationRoutes from "./modules/clinical/investigations.routes";
import pharmacyRoutes from "./modules/pharmacy/pharmacy.routes";
import inpatientRoutes from "./modules/inpatient/inpatient.routes";

const app = express();
if (config.isProd) app.set("trust proxy", 1);

app.use(helmet());
app.use(cors({ origin: config.webOrigin, credentials: true }));
app.use(express.json({
  limit: "100kb",
  verify: (req, _res, buffer) => { (req as typeof req & { rawBody?: Buffer }).rawBody = Buffer.from(buffer); },
}));
app.use(cookieParser());
app.use((req, res, next) => {
  const id = req.get("x-request-id") ?? crypto.randomUUID();
  res.setHeader("X-Request-Id", id);
  next();
});

app.get("/health", (_req, res) => res.json({ success: true, data: { status: "ok" } }));

const v1 = express.Router();
v1.use(resolveTenant);
v1.use("/auth", authRoutes);
v1.use("/admin", adminRoutes);
v1.use(appointmentRoutes);
v1.use(billingRoutes);
v1.use(billingOperationsRoutes);
v1.use(prescriptionRoutes);
v1.use(investigationRoutes);
v1.use(pharmacyRoutes);
v1.use(inpatientRoutes);
v1.use(clinicalRoutes);
v1.use(receptionRoutes);
app.use("/api/v1", v1);

app.use(notFound);
app.use(errorHandler);

const server = createServer(app);
const queueSockets = new WebSocketServer({ noServer: true });
const socketTenants = new WeakMap<WebSocket, string>();
const socketExpirations = new WeakMap<WebSocket, number>();

async function queueSnapshot(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { timezone: true } });
  const timezone = tenant?.timezone ?? "Asia/Kolkata";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)!.value;
  const date = `${value("year")}-${value("month")}-${value("day")}`;
  const appointments = await prisma.appointment.findMany({
    where: {
      tenantId,
      scheduledFor: new Date(`${date}T00:00:00.000Z`),
      cancelledAt: null,
      status: { in: [AppointmentStatus.CHECKED_IN, AppointmentStatus.IN_CONSULTATION] },
    },
    include: {
      patient: { select: { id: true, mrn: true, user: { select: { name: true } } } },
      doctor: { select: { id: true, user: { select: { name: true } } } },
    },
    orderBy: [{ tokenNumber: "asc" }, { checkedInAt: "asc" }],
    take: 300,
  });
  return {
    date,
    queue: appointments.map((appointment) => ({
      id: appointment.id,
      tokenNumber: appointment.tokenNumber,
      source: appointment.source,
      status: appointment.status,
      checkedInAt: appointment.checkedInAt,
      patient: { id: appointment.patient.id, name: appointment.patient.user.name, mrn: appointment.patient.mrn },
      doctor: { id: appointment.doctor.id, name: appointment.doctor.user.name },
    })),
  };
}

server.on("upgrade", (request, socket, head) => {
  const reject = (status: number, message: string) => {
    socket.write(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\n\r\n`);
    socket.destroy();
  };

  if (new URL(request.url ?? "/", "http://localhost").pathname !== "/api/v1/queue/live") {
    reject(404, "Not Found");
    return;
  }
  if (request.headers.origin !== config.webOrigin) {
    reject(403, "Forbidden");
    return;
  }
  const accessToken = request.headers.cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith("access_token="))?.slice("access_token=".length);
  if (!accessToken) {
    reject(401, "Unauthorized");
    return;
  }

  void (async () => {
    try {
      const payload = verifyAccessToken(decodeURIComponent(accessToken));
      if (!payload.exp || payload.exp * 1000 <= Date.now()) {
        reject(401, "Unauthorized");
        return;
      }
      const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { tenantId: true, roles: true, status: true } });
      const allowed = [Role.ADMIN, Role.RECEPTION].some((role) => user?.roles.includes(role));
      const tenant = user && await prisma.tenant.findUnique({ where: { id: user.tenantId }, select: { isActive: true } });
      if (!user || user.tenantId !== payload.tid || user.status !== UserStatus.ACTIVE || !allowed || !tenant?.isActive) {
        reject(403, "Forbidden");
        return;
      }
      queueSockets.handleUpgrade(request, socket, head, (client) => {
        socketTenants.set(client, user.tenantId);
        const expiration = payload.exp! * 1000;
        socketExpirations.set(client, expiration);
        const expiryTimer = setTimeout(() => client.close(4401, "Session expired"), Math.max(0, expiration - Date.now()));
        expiryTimer.unref();
        client.on("close", () => clearTimeout(expiryTimer));
        queueSockets.emit("connection", client, request);
        void queueSnapshot(user.tenantId).then((data) => {
          if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ type: "queue.snapshot", data }));
        }).catch((error: unknown) => {
          console.error("queue websocket snapshot failed", error);
          client.close(1011, "Queue unavailable");
        });
      });
    } catch {
      reject(401, "Unauthorized");
    }
  })();
});

queueEvents.on("queue.changed", (tenantId: string) => {
  void queueSnapshot(tenantId).then((data) => {
    for (const client of queueSockets.clients) {
      if (client.readyState === WebSocket.OPEN && socketTenants.get(client) === tenantId) {
        if ((socketExpirations.get(client) ?? 0) <= Date.now()) {
          client.close(4401, "Session expired");
          continue;
        }
        client.send(JSON.stringify({ type: "queue.update", data }));
      }
    }
  }).catch((error: unknown) => console.error("queue websocket update failed", error));
});

server.listen(config.port, () => console.log(`MediAccess API listening on :${config.port}`));
