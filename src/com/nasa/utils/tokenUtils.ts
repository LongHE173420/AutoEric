import { ENV } from "../config/env";

export function decodeJwtPayload(token: string): any {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;

    const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const jsonStr = Buffer.from(payloadBase64, 'base64').toString('utf-8');
    return JSON.parse(jsonStr);
  } catch (e) {
    return null;
  }
}

export function isAccessExpired(accessToken: string): boolean {
  if (!accessToken) return true;
  const payload = decodeJwtPayload(accessToken);
  if (!payload) return true;

  const nowMs = Date.now();
  if (payload.exp) {
    return nowMs >= payload.exp * 1000;
  }

  const iatMs = (payload.iat || 0) * 1000;
  if (!iatMs) return true;
  return nowMs > iatMs + ENV.ACCESS_TTL_MS;
}

export function isRefreshExpired(refreshToken: string): boolean {
  if (!refreshToken) return true;
  const payload = decodeJwtPayload(refreshToken);
  if (!payload) return true;

  const nowMs = Date.now();
  if (payload.exp) {
    return nowMs >= payload.exp * 1000;
  }

  const iatMs = (payload.iat || 0) * 1000;
  if (!iatMs) return true;
  return nowMs > iatMs + ENV.REFRESH_TTL_MS;
}

export function usernameFromToken(token: string): string {
  const payload = decodeJwtPayload(token);
  if (!payload) return "";
  const username = payload.sub || payload.username || payload.name || "";
  return String(username).toLowerCase();
}
