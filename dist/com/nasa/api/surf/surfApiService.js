"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SurfApiService = void 0;
const env_1 = require("../../config/env");
const ApiClient_1 = require("../../utils/ApiClient");
const headers_1 = require("../../utils/headers");
class SurfApiService {
    static async generateId(accessToken, headers = (0, headers_1.buildHeaders)(), agent) {
        return ApiClient_1.ApiClient.createSignedClient(headers, agent).post(`${env_1.ENV.KONG_URL}/api/surf/generate-id`, "", {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` }
        });
    }
    static async createSurf(accessToken, surfData, headers = (0, headers_1.buildHeaders)(), agent) {
        return ApiClient_1.ApiClient.createSignedClient(headers, agent).post(`${env_1.ENV.KONG_URL}/api/surf/create`, ApiClient_1.ApiClient.buildPayload(surfData), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
        });
    }
    static async completeSurf(accessToken, surfData, headers = (0, headers_1.buildHeaders)(), agent) {
        return ApiClient_1.ApiClient.createSignedClient(headers, agent).post(`${env_1.ENV.KONG_URL}/api/surf/complete`, ApiClient_1.ApiClient.buildPayload(surfData), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
        });
    }
    static async getSurfHome(accessToken, headers = (0, headers_1.buildHeaders)(), surfId = "", createdAt = Math.floor(Date.now() / 1000), limit = 4, agent) {
        return ApiClient_1.ApiClient.createSignedClient(headers, agent).post(`${env_1.ENV.KONG_URL}/api/surf/home`, ApiClient_1.ApiClient.buildPayload({ surfId, createdAt, limit }), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            transformResponse: [(data) => {
                    if (typeof data === 'string') {
                        const transformed = data.replace(/"(id|postId|commentId|parentId|userId|accountId|surfId|senderId|receiverId)"\s*:\s*(\d+)/g, '"$1": "$2"');
                        try {
                            return JSON.parse(transformed);
                        }
                        catch (e) {
                            return data;
                        }
                    }
                    return data;
                }]
        });
    }
}
exports.SurfApiService = SurfApiService;
