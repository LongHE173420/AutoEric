"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SurfService = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto_1 = require("crypto");
const surfApiService_1 = require("../../api/surf/surfApiService");
const mysqlStore_1 = require("../../data/mysqlStore");
const MediaHelper_1 = require("../../utils/MediaHelper");
class SurfService {
    constructor(logger, acc, proxyAgent) {
        this.logger = logger;
        this.acc = acc;
        this.proxyAgent = proxyAgent;
        this.mediaHelper = new MediaHelper_1.MediaHelper(logger, proxyAgent);
    }
    async runSequentialSurf(work) {
        try {
            const previous = SurfService.surfQueue;
            let release;
            SurfService.surfQueue = new Promise((resolve) => {
                release = resolve;
            });
            await previous.catch(() => { });
            return await work().finally(() => {
                release();
            });
        }
        catch (e) {
            this.logger.error("RUN_SEQUENTIAL_SURF_ERROR", { err: e.message || String(e) });
            throw e;
        }
    }
    buildSurfCompletePayload(surfId, uploadedVideoFileName, uploadedThumbFileName, videoInfo) {
        try {
            const payload = {
                id: surfId,
                content: "",
                media: `${path.basename(uploadedVideoFileName)}/${this.mediaHelper.padMediaMetric(videoInfo.width)}/${this.mediaHelper.padMediaMetric(videoInfo.height)}/${this.mediaHelper.padMediaMetric(videoInfo.duration)}`,
                mediaType: "VIDEO",
                privacy: "PUBLIC",
                allowComments: true,
                checkinLocation: JSON.stringify({
                    lat: 0,
                    lon: 0,
                    source: "GPS",
                    name: ""
                }),
                surfType: "SURF",
                hashtags: "[]",
                tags: "[]",
                m3u8Content: "[]"
            };
            if (uploadedThumbFileName) {
                payload.thumbnailFileName = path.basename(uploadedThumbFileName);
            }
            return payload;
        }
        catch (e) {
            this.logger.error("BUILD_SURF_PAYLOAD_ERROR", { err: e.message || String(e) });
            throw e;
        }
    }
    async handleAutoCreateSurf(accessToken, h, ctx, doMission) {
        try {
            await this.runSequentialSurf(async () => {
                const phone = String(this.acc.phone || "").trim();
                const maxVideoAttempts = 3;
                for (let attempt = 1; attempt <= maxVideoAttempts; attempt++) {
                    const video = await (0, mysqlStore_1.getNextVideoToPost)(phone).catch(() => null);
                    if (!video)
                        break;
                    this.logger.info("SURF_VIDEO_START", { ...ctx, videoId: video.id, source: video.source_url, attempt });
                    const handleVideoFailure = async (err) => {
                        await (0, mysqlStore_1.releaseVideoReservation)(video?.id, video?.claimToken).catch(() => { });
                        const isBrokenLocalVideo = err?.message?.includes("Video file not found") ||
                            err?.message?.includes("Video too large") ||
                            err?.message?.includes("ffmpeg exited with code 1") ||
                            err?.message?.includes("ffprobe");
                        if (isBrokenLocalVideo && attempt < maxVideoAttempts) {
                            this.logger.warn("BROKEN_SURF_VIDEO_RETRY_NEXT", { ...ctx, videoId: video.id, attempt, nextAttempt: attempt + 1 });
                            return { action: "continue" };
                        }
                        throw err;
                    };
                    const executionResult = await doMission("CreateSurf", async () => {
                        const videoPath = video.local_path;
                        if (!fs.existsSync(videoPath)) {
                            const err = new Error(`Video file not found: ${videoPath}`);
                            await this.mediaHelper.deleteBrokenVideo(video, ctx, "FILE_NOT_FOUND", err, "BROKEN_SURF_VIDEO").catch(() => { });
                            throw err;
                        }
                        const fileSizeBytes = fs.statSync(videoPath).size;
                        const MAX_SIZE = 5 * 1024 * 1024;
                        if (fileSizeBytes > MAX_SIZE) {
                            const err = new Error(`Video too large: ${(fileSizeBytes / 1024 / 1024).toFixed(2)}MB`);
                            await this.mediaHelper.deleteBrokenVideo(video, ctx, "FILE_TOO_LARGE", err, "BROKEN_SURF_VIDEO").catch(() => { });
                            throw err;
                        }
                        const uploadBaseName = (0, crypto_1.randomUUID)();
                        const uploadVideoName = `${uploadBaseName}.mp4`;
                        const uploadThumbName = `${uploadBaseName}.jpg`;
                        const thumbnailPath = path.join(path.dirname(videoPath), uploadThumbName);
                        let videoInfo;
                        let thumbnailSize = 0;
                        await this.mediaHelper.probeVideoInfo(videoPath).then(async (info) => {
                            videoInfo = info;
                            await this.mediaHelper.createVideoThumbnail(videoPath, thumbnailPath).catch((e) => { throw e; });
                            thumbnailSize = fs.statSync(thumbnailPath).size;
                        }).catch(async (err) => {
                            if (fs.existsSync(thumbnailPath)) {
                                try {
                                    fs.unlinkSync(thumbnailPath);
                                }
                                catch (e) { }
                            }
                            await this.mediaHelper.deleteBrokenVideo(video, ctx, "LOCAL_VIDEO_PROCESSING_FAILED", err, "BROKEN_SURF_VIDEO").catch(() => { });
                            throw err;
                        });
                        const generateSurfIdResponse = await surfApiService_1.SurfApiService.generateId(accessToken, h, this.proxyAgent);
                        const surfId = generateSurfIdResponse?.data?.data || generateSurfIdResponse?.data?.id;
                        this.logger.info("SURF_ID_GENERATED", { ...ctx, surfId: String(surfId || ""), responseData: generateSurfIdResponse?.data });
                        if (!surfId)
                            throw new Error("Failed to generate surf ID");
                        const uploadResult = await Promise.resolve().then(async () => {
                            let thumbUpload = null;
                            let thumbnailUploadSkipped = false;
                            try {
                                thumbUpload = await this.mediaHelper.uploadMediaViaPresignedLink(accessToken, {
                                    entityId: String(surfId),
                                    type: "SURF",
                                    purpose: "SURF_THUMBNAIL",
                                    fileName: uploadThumbName,
                                    fileSize: thumbnailSize,
                                    mimeType: "IMAGE_JPEG",
                                    lastFile: false
                                }, thumbnailPath, "image/jpeg", h, ctx, "SURF_THUMBNAIL");
                            }
                            catch (err) {
                                thumbnailUploadSkipped = true;
                                this.logger.warn("SURF_THUMBNAIL_UPLOAD_SKIPPED_AFTER_FAILURE", {
                                    ...ctx,
                                    surfId: String(surfId),
                                    failedMode: "presigned",
                                    err: err?.message || String(err || "")
                                });
                            }
                            const videoUpload = await this.mediaHelper.uploadMediaViaPresignedLink(accessToken, {
                                entityId: String(surfId),
                                type: "SURF",
                                purpose: "SURF_VIDEO",
                                fileName: uploadVideoName,
                                fileSize: videoInfo.size,
                                mimeType: "VIDEO_MP4",
                                lastFile: true
                            }, videoPath, "video/mp4", h, ctx, "SURF_FILE");
                            return { thumbUpload, videoUpload, thumbnailUploadSkipped };
                        }).finally(() => {
                            if (fs.existsSync(thumbnailPath)) {
                                try {
                                    fs.unlinkSync(thumbnailPath);
                                }
                                catch (e) { }
                            }
                        });
                        const uploadedVideoFileName = path.basename(uploadResult.videoUpload?.fileName || uploadVideoName);
                        const uploadedThumbFileName = uploadResult.thumbUpload?.fileName
                            ? path.basename(uploadResult.thumbUpload.fileName)
                            : "";
                        const completePayload = this.buildSurfCompletePayload(String(surfId), uploadedVideoFileName, uploadedThumbFileName, videoInfo);
                        this.logger.info("SURF_COMPLETE_REQUEST", {
                            ...ctx,
                            surfId: String(surfId),
                            thumbnailUploadSkipped: uploadResult.thumbnailUploadSkipped,
                            payload: completePayload
                        });
                        const completeSurfResponse = await surfApiService_1.SurfApiService.completeSurf(accessToken, completePayload, h, this.proxyAgent);
                        this.logger.info("SURF_COMPLETE_RESPONSE", { ...ctx, surfId: String(surfId), responseData: completeSurfResponse?.data, status: completeSurfResponse?.status });
                        const posted = await (0, mysqlStore_1.markVideoPosted)(video.id, phone, video.claimToken).catch(() => null);
                        if (posted?.fullyPosted && posted.localPath && fs.existsSync(posted.localPath)) {
                            try {
                                fs.unlinkSync(posted.localPath);
                                this.logger.info("SOURCE_SURF_VIDEO_DELETED_AFTER_POST", { videoId: video.id });
                            }
                            catch (e) { }
                        }
                        return { action: "success", data: completeSurfResponse };
                    }, ctx).catch(handleVideoFailure);
                    if (executionResult?.action === "continue")
                        continue;
                    return;
                }
                this.logger.info("NO_SURF_VIDEO_AVAILABLE_SKIP", ctx);
            });
        }
        catch (e) {
            this.logger.error("HANDLE_AUTO_CREATE_SURF_ERROR", { ...ctx, err: e.message || String(e) });
            throw e;
        }
    }
}
exports.SurfService = SurfService;
SurfService.surfQueue = Promise.resolve();
