"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JsonKVStore = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
class JsonKVStore {
    constructor(filePath) {
        this.filePath = filePath;
    }
    readAll() {
        try {
            const raw = fs_1.default.readFileSync(this.filePath, "utf-8");
            const obj = JSON.parse(raw);
            if (obj && typeof obj === "object")
                return obj;
        }
        catch {
            // ignore
        }
        return {};
    }
    writeAll(obj) {
        fs_1.default.mkdirSync(path_1.default.dirname(this.filePath), { recursive: true });
        fs_1.default.writeFileSync(this.filePath, JSON.stringify(obj, null, 2), "utf-8");
    }
    getItem(key) {
        const all = this.readAll();
        return Object.prototype.hasOwnProperty.call(all, key) ? all[key] : null;
    }
    setItem(key, value) {
        const all = this.readAll();
        all[key] = value;
        this.writeAll(all);
    }
    removeItem(key) {
        const all = this.readAll();
        if (Object.prototype.hasOwnProperty.call(all, key)) {
            delete all[key];
            this.writeAll(all);
        }
    }
    clear() {
        this.writeAll({});
    }
    keys() {
        const all = this.readAll();
        return Object.keys(all);
    }
}
exports.JsonKVStore = JsonKVStore;
