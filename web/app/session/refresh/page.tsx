"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { post } from "@/lib/api";

/** Silent token refresh: middleware sends users here when the 15-min access token has expired. */
export default function Refresh({ searchParams }: { searchParams: { next?: string } }) {
  const router = useRouter();
  useEffect(() => {
    const next = searchParams.next && searchParams.next.startsWith("/") && !searchParams.next.startsWith("//") ? searchParams.next : "/hms";
    post("/auth/refresh")
      .then(() => router.replace(next))
      .catch(() => router.replace(next.startsWith("/portal") ? "/login" : "/staff/login"));
  }, [router, searchParams.next]);
  return <p style={{ padding: 32 }}>Restoring your session…</p>;
}
