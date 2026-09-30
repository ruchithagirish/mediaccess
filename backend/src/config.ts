import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
  jwtAccessSecret: required("JWT_ACCESS_SECRET"),
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  defaultTenantSlug: process.env.DEFAULT_TENANT_SLUG ?? "demo",
  isProd: process.env.NODE_ENV === "production",
  accessTtlSec: 15 * 60,
  refreshTtlSec: 7 * 24 * 60 * 60,
};
