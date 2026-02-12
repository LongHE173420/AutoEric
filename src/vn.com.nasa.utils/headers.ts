import { randomUUID } from "crypto";

export function buildHeaders(deviceId: string) {
    return {
        "Content-Type": "application/json",
        "X-Device-Id": deviceId,
        "X-Client-Type": "web",
        "Accept-Language": "vi",
        "Idempotency-Key": randomUUID()
    };
}
