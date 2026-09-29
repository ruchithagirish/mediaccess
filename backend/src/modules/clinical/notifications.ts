import nodemailer from "nodemailer";
import { prisma } from "../../lib/prisma";
import type { ClinicalNotificationType } from "@prisma/client";

export type ClinicalNotice = {
  tenantId: string;
  userId: string;
  email?: string | null;
  type: ClinicalNotificationType;
  entityId: string;
  title: string;
  message: string;
};

async function sendEmail(notice: ClinicalNotice) {
  const host = process.env.SMTP_HOST;
  const from = process.env.SMTP_FROM;
  if (!host || !from || !notice.email) return;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    ...(process.env.SMTP_USER ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD ?? "" } } : {}),
  });
  await transporter.sendMail({ from, to: notice.email, subject: notice.title, text: notice.message });
}

export async function publishClinicalNotifications(notices: ClinicalNotice[]) {
  if (!notices.length) return;
  await prisma.clinicalNotification.createMany({
    data: notices.map(({ tenantId, userId, type, entityId, title, message }) => ({ tenantId, userId, type, entityId, title, message })),
  });
  await Promise.all(notices.map(async (notice) => {
    try { await sendEmail(notice); }
    catch (error) { console.error("clinical notification email failed", error); }
  }));
}