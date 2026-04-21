"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecureStore = void 0;
const path_1 = __importDefault(require("path"));
const jsonStore_1 = require("./jsonStore");
const FILE = path_1.default.resolve(process.cwd(), "data", "secure_store.json");
exports.SecureStore = new jsonStore_1.JsonKVStore(FILE);
