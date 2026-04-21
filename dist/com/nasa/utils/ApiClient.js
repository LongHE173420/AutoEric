"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiClient = void 0;
const axios_1 = __importDefault(require("axios"));
const env_1 = require("../config/env");
const axiosSignature_1 = require("./axiosSignature");
class ApiClient {
    static createSignedClient(headers, agent) {
        const deviceId = headers?.["X-Device-Id"] || headers?.["x-device-id"];
        const client = axios_1.default.create({
            baseURL: env_1.ENV.KONG_URL,
            httpsAgent: agent,
            timeout: 10000
        });
        (0, axiosSignature_1.applyStandardInterceptors)(client, String(deviceId || ""));
        return client;
    }
    static buildPayload(data) {
        return typeof data === 'string'
            ? data
            : JSON.stringify(data).replace(/"(id|postId|commentId|parentId|userId|accountId|surfId|senderId|receiverId|entityId)"\s*:\s*"?(\d+)"?/g, '"$1":"$2"');
    }
}
exports.ApiClient = ApiClient;
