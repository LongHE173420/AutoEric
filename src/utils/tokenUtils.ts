import { ENV } from "../config/env";

export function tokenIssuedAt(token: string): number {
  const parts = String(token || "").split(".");
  const ts = Number(parts[2]);
  return Number.isFinite(ts) ? ts : 0;
}

export function usernameFromToken(token: string): string {
  const parts = String(token || "").split(".");
  if (parts.length < 3) return "";
  return String(parts[1] ?? "").toLowerCase();
}

export function isAccessExpired(accessToken: string): boolean {
  const ts = tokenIssuedAt(accessToken);
  if (!ts) return true;
  return Date.now() > ts + ENV.ACCESS_TTL_MS;
}

export function isRefreshExpired(refreshToken: string): boolean {
  const ts = tokenIssuedAt(refreshToken);
  if (!ts) return true;
  return Date.now() > ts + ENV.REFRESH_TTL_MS;
}
