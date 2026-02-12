import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { ENV } from "../vn.com.nasa.config/env";

const DEVICE_FILE = path.resolve(process.cwd(), "data", "device.json");

type DeviceState = { deviceId: string };

function safeRead(): string | null {
    try {
        const raw = fs.readFileSync(DEVICE_FILE, "utf-8");
        const st = JSON.parse(raw) as DeviceState;
        if (st?.deviceId) return String(st.deviceId);
    } catch {
        // ignore
    }
    return null;
}

function safeWrite(id: string) {
    try {
        fs.mkdirSync(path.dirname(DEVICE_FILE), { recursive: true });
        fs.writeFileSync(DEVICE_FILE, JSON.stringify({ deviceId: id }, null, 2), "utf-8");
    } catch {
        // ignore
    }
}

export function getDeviceId(): string {
    const forced = String(ENV.DEVICE_ID || "").trim();
    if (forced) return forced;

    const existing = safeRead();
    if (existing) return existing;

    const id = uuidv4();
    safeWrite(id);
    return id;
}
