"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AsyncStore = void 0;
const path_1 = __importDefault(require("path"));
const jsonStore_1 = require("./jsonStore");
const FILE = path_1.default.resolve(process.cwd(), "data", "async_storage.json");
exports.AsyncStore = new jsonStore_1.JsonKVStore(FILE);
