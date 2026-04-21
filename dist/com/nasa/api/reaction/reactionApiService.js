"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReactionApiService = void 0;
const env_1 = require("../../config/env");
const ApiClient_1 = require("../../utils/ApiClient");
const headers_1 = require("../../utils/headers");
class ReactionApiService {
    static async sendReaction(accessToken, postId, type, headers = (0, headers_1.buildHeaders)(), agent) {
        return ApiClient_1.ApiClient.createSignedClient(headers, agent).post(`${env_1.ENV.KONG_URL}/api/posts/reaction/send`, ApiClient_1.ApiClient.buildPayload({ postId: String(postId), reactionTypeCode: type }), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        });
    }
    static async removeReaction(accessToken, postId, headers = (0, headers_1.buildHeaders)(), agent) {
        return ApiClient_1.ApiClient.createSignedClient(headers, agent).post(`${env_1.ENV.KONG_URL}/api/posts/reaction/remove`, ApiClient_1.ApiClient.buildPayload({ postId: String(postId) }), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        });
    }
    static async listReactions(accessToken, headers = (0, headers_1.buildHeaders)(), limit = 10, offset = 0, agent) {
        return ApiClient_1.ApiClient.createSignedClient(headers, agent).get(`${env_1.ENV.KONG_URL}/api/reaction/list`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            params: { limit, offset }
        });
    }
    static async listReactionsByPost(accessToken, postId, headers = (0, headers_1.buildHeaders)(), limit = 10, offset = 0, agent) {
        return ApiClient_1.ApiClient.createSignedClient(headers, agent).post(`${env_1.ENV.KONG_URL}/api/posts/reaction/list`, ApiClient_1.ApiClient.buildPayload({ postId, limit, offset }), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }
        });
    }
}
exports.ReactionApiService = ReactionApiService;
