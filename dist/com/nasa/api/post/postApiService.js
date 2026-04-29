"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostApiService = void 0;
const env_1 = require("../../config/env");
const ApiClient_1 = require("../../utils/ApiClient");
const headers_1 = require("../../utils/headers");
const POST_API_BASE_URL = env_1.ENV.KONG_URL;
class PostApiService {
    static async createPost(accessToken, postData, headers = (0, headers_1.buildHeaders)(), agent) {
        return ApiClient_1.ApiClient.createSignedClient(headers, agent).post(`${POST_API_BASE_URL}/api/posts/create`, ApiClient_1.ApiClient.buildPayload(postData), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
        });
    }
    static async generateId(accessToken, headers = (0, headers_1.buildHeaders)(), agent) {
        return ApiClient_1.ApiClient.createSignedClient(headers, agent).post(`${POST_API_BASE_URL}/api/posts/generate-id`, "", {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` }
        });
    }
    static async completePost(accessToken, postData, headers = (0, headers_1.buildHeaders)(), agent) {
        return ApiClient_1.ApiClient.createSignedClient(headers, agent).post(`${POST_API_BASE_URL}/api/posts/complete`, ApiClient_1.ApiClient.buildPayload(postData), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
        });
    }
}
exports.PostApiService = PostApiService;
