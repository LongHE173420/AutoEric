import readline from "readline";
import type { Logger } from "pino";
import { ENV } from "../vn.com.nasa.config/env";
import { AuthServiceApi } from "../vn.com.nasa.connection.api/authService";
import { maskOtp } from "./log";

export type WaitOtpOptions = {
    timeoutMs?: number;
    pollMs?: number;
    sinceMs?: number;
    context?: string;
    logger?: Logger;
    headers?: any;
};

function parseOtpPayload(data: any): { otp: string | null; tsMs: number | null } {
    if (!data) return { otp: null, tsMs: null };

    const directOtp = data.otp ?? data.smsOtp ?? data.otpKeyOtp ?? null;

    const msg = data.msg ?? data.smsLatest ?? null;
    const msgOtp = msg?.otp ?? null;

    const otp = String(directOtp || msgOtp || "").trim();
    const hasOtp = otp.length >= 4;

    const tsRaw = msg?.timestamp ?? msg?.received_at ?? msg?.receivedAt ?? data.timestamp ?? null;
    let tsMs: number | null = null;
    if (tsRaw != null) {
        if (typeof tsRaw === "number") tsMs = tsRaw;
        else {

            const n = Number(tsRaw);
            if (Number.isFinite(n)) tsMs = n;
            else {

                const d = Date.parse(String(tsRaw));
                if (Number.isFinite(d)) tsMs = d;
            }
        }
    }

    return { otp: hasOtp ? otp : null, tsMs };
}

async function checkOtpDebug(
    api: AuthServiceApi,
    phone: string,
    context: string,
    headers: any,
    sinceMs: number,
    lastOtp: string | null,
    logger?: Logger
): Promise<string | null> {
    try {
        const res = await api.debugRedisOtp(phone, context, headers);
        const body = res.data;
        const payload = body?.data;
        const { otp, tsMs } = parseOtpPayload(payload);

        const freshEnough = sinceMs ? (tsMs != null ? tsMs >= sinceMs : true) : true;

        if (otp && freshEnough) {
            if (otp !== lastOtp) {
                logger?.debug(
                    {
                        phone,
                        context,
                        otp: maskOtp(otp),
                        tsMs,
                        keyUsed: payload?.keyUsed ?? null,
                    },
                    "OTP_FOUND"
                );
            }
            return otp;
        }

        if (ENV.LOG_VERBOSE) {
            logger?.debug(
                {
                    phone,
                    context,
                    gotOtp: otp ? true : false,
                    tsMs,
                    sinceMs,
                    freshEnough,
                },
                "OTP_POLL"
            );
        }
    } catch (err: any) {
        logger?.debug({ phone, context, err: err?.message ?? String(err) }, "OTP_POLL_ERR");
    }
    return null;
}

export async function waitForOtpFromAuthService(
    api: AuthServiceApi,
    phone: string,
    opts: WaitOtpOptions = {}
): Promise<string | null> {
    const timeoutMs = opts.timeoutMs ?? ENV.OTP_TIMEOUT_MS;
    const pollMs = opts.pollMs ?? ENV.OTP_POLL_MS;
    const sinceMs = opts.sinceMs ?? 0;
    const context = opts.context ?? "LOGIN";
    const logger = opts.logger;
    const headers = opts.headers;

    const t0 = Date.now();
    let lastOtp: string | null = null;

    while (Date.now() - t0 < timeoutMs) {
        const otp = await checkOtpDebug(api, phone, context, headers, sinceMs, lastOtp, logger);
        if (otp) return otp;
        lastOtp = otp ?? lastOtp;
        await new Promise((r) => setTimeout(r, pollMs));
    }

    logger?.debug({ phone, context, timeoutMs }, "OTP_TIMEOUT");
    return null;
}

export async function promptOtpOnce(promptText: string, logger?: Logger): Promise<string> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const q = (s: string) => new Promise<string>((resolve) => rl.question(s, resolve));
    const otp = (await q(promptText)).trim();
    rl.close();
    logger?.info({ otp: maskOtp(otp) }, "OTP_USER_INPUT");
    return otp;
}
