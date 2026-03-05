import { v4 as uuidv4 } from 'uuid';

export function buildHeaders(deviceId?: string) {
    return {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-Client-Type": "web",
        "X-Device-Id": deviceId,
        "X-Forwarded-Proto": "https",
        "User-Agent": "ERIC/1.2.0 (Android; 13; Oppo Find X6)",
        "Accept-Language": "vi",
        "Idempotency-Key": uuidv4()
    };
}
