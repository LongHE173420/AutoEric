import fs from "fs";
import path from "path";

export class JsonKVStore {
  constructor(private filePath: string) {}

  private readAll(): Record<string, any> {
    try {
      const raw = fs.readFileSync(this.filePath, "utf-8");
      const obj = JSON.parse(raw);
      if (obj && typeof obj === "object") return obj;
    } catch {
      // ignore
    }
    return {};
  }

  private writeAll(obj: Record<string, any>) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(obj, null, 2), "utf-8");
  }

  getItem<T=any>(key: string): T | null {
    const all = this.readAll();
    return Object.prototype.hasOwnProperty.call(all, key) ? (all[key] as T) : null;
  }

  setItem(key: string, value: any) {
    const all = this.readAll();
    all[key] = value;
    this.writeAll(all);
  }

  removeItem(key: string) {
    const all = this.readAll();
    if (Object.prototype.hasOwnProperty.call(all, key)) {
      delete all[key];
      this.writeAll(all);
    }
  }

  clear() {
    this.writeAll({});
  }

  keys(): string[] {
    const all = this.readAll();
    return Object.keys(all);
  }
}
