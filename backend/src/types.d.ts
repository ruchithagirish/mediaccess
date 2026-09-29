import type { AccessPayload } from "./lib/tokens";

declare global {
  namespace Express {
    interface Request {
      user?: AccessPayload;
      tenantId?: string;
    }
  }
}
export {};
