import { ENV } from "../config/env";

export function maskSecret(s: string, allowPlaintext: boolean, label?: string) {
  const v = String(s ?? "");
  if (allowPlaintext) return v;
  const len = v.length;
  const tag = label ? `${label}` : "***";
  return `${tag}len=${len}`;
}

export function maskPassword(pw: string) {
  return maskSecret(pw, ENV.LOG_PASSWORD_PLAINTEXT, "***");
}

export function maskOtp(otp: string) {
  return maskSecret(otp, ENV.LOG_OTP_PLAINTEXT, "***");
}

export function maskToken(token: string) {
  if (!token) return "";
  const t = String(token);
  if (t.length <= 12) return "***";
  return `${t.slice(0, 8)}...${t.slice(-6)}`;
}
