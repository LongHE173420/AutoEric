import { v4 as uuidv4 } from 'uuid';

export function buildHeaders(deviceId?: string, userAgent?: string) {
    return {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-Client-Type": "mobile",
        "X-Device-Id": deviceId,
        "X-Forwarded-Proto": "https",
        "User-Agent": userAgent || "ERIC/1.2.0 (Android; 13; Oppo Find X6)",
        "Accept-Language": "vi"
    };
}
