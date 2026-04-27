"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommentApiService = void 0;
const env_1 = require("../../config/env");
const ApiClient_1 = require("../../utils/ApiClient");
const headers_1 = require("../../utils/headers");
class CommentApiService {
    static async createComment(accessToken, commentData, headers = (0, headers_1.buildHeaders)(), agent) {
        return ApiClient_1.ApiClient.createSignedClient(headers, agent).post(`${env_1.ENV.KONG_URL}/api/comments/create`, ApiClient_1.ApiClient.buildPayload(commentData), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }
        });
    }
}
exports.CommentApiService = CommentApiService;
