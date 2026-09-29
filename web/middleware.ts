import { NextResponse, type NextRequest } from "next/server";
import { decodeJwt } from "jose";
import { ROLE_TO_SLUG, SLUG_TO_ROLE, STAFF_ROLE_ORDER } from "@/lib/roles";

/**
 * UX-level route guard. The API verifies the token signature and authorization on every request.
 * Runs for /hms/* (staff) and /portal (patients).
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const go = (path: string) => NextResponse.redirect(new URL(path, req.url));
  const isPortal = pathname.startsWith("/portal");
  const loginPath = isPortal ? "/login" : "/staff/login";

  let roles: string[] | null = null;
  let shouldRefresh = false;
  const token = req.cookies.get("access_token")?.value;
  if (token) {
    try {
      const payload = decodeJwt(token);
      roles = Array.isArray(payload.roles) ? payload.roles.filter((role): role is string => typeof role === "string") : [];
      shouldRefresh = typeof payload.exp !== "number" || payload.exp * 1000 <= Date.now();
    } catch {
      roles = null;
      shouldRefresh = true;
    }
  }

  if (!roles || shouldRefresh) {
    // Access token missing/expired: if a refresh cookie exists, refresh silently then come back.
    if (req.cookies.get("refresh_token")) return go(`/session/refresh?next=${encodeURIComponent(pathname)}`);
    return go(loginPath);
  }

  if (isPortal) return roles.includes("PATIENT") ? NextResponse.next() : go("/login");

  const staffRoles = STAFF_ROLE_ORDER.filter((r) => roles!.includes(r));
  if (!staffRoles.length) return go("/staff/login");

  const first = `/hms/dashboard/${ROLE_TO_SLUG[staffRoles[0]]}`;
  if (pathname === "/hms" || pathname === "/hms/") return go(first);

  const m = pathname.match(/^\/hms\/dashboard\/([^/]+)/);
  const role = m ? SLUG_TO_ROLE[m[1]] : undefined;
  if (!role || !staffRoles.includes(role)) return go(first);
  return NextResponse.next();
}

export const config = { matcher: ["/hms/:path*", "/portal/:path*"] };
