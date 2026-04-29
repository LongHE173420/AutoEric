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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MediaHelper = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const form_data_1 = __importDefault(require("form-data"));
const env_1 = require("../config/env");
const mediaApiService_1 = require("../api/media/mediaApiService");
const mysqlStore_1 = require("../data/mysqlStore");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
class MediaHelper {
    constructor(logger, proxyAgent) {
        this.logger = logger;
        this.proxyAgent = proxyAgent;
    }
    stringifyForLog(data, maxLength = 2000) {
        try {
            if (data === undefined || data === null)
                return undefined;
            return (typeof data === "string" ? data : JSON.stringify(data)).slice(0, maxLength);
        }
        catch {
            return undefined;
        }
    }
    extractHttpFailureDebug(err) {
        const requestDebug = err?.requestDebug;
        return {
            failedUrl: err?.config?.url || requestDebug?.url,
            failedMethod: String(err?.config?.method || requestDebug?.method || "").toUpperCase() || undefined,
            responseStatus: err?.response?.status,
            responseStatusText: err?.response?.statusText,
            backendRaw: this.stringifyForLog(err?.response?.data) || requestDebug?.backendRaw,
            requestHeaders: err?.requestHeaders || requestDebug?.requestHeaders,
            responseHeaders: err?.responseHeaders || requestDebug?.responseHeaders,
            uploadAttemptUrls: err?.uploadAttemptUrls || requestDebug?.uploadAttemptUrls,
            requestDebug
        };
    }
    getLocalFileDebug(filePath) {
        try {
            if (!fs.existsSync(filePath)) {
                return {
                    exists: false,
                    path: path.resolve(filePath)
                };
            }
            const stat = fs.statSync(filePath);
            const fd = fs.openSync(filePath, "r");
            const headLength = Math.min(32, stat.size);
            const tailLength = Math.min(32, stat.size);
            const head = Buffer.alloc(headLength);
            const tail = Buffer.alloc(tailLength);
            try {
                if (headLength > 0) {
                    fs.readSync(fd, head, 0, headLength, 0);
                }
                if (tailLength > 0) {
                    fs.readSync(fd, tail, 0, tailLength, Math.max(0, stat.size - tailLength));
                }
            }
            finally {
                fs.closeSync(fd);
            }
            return {
                exists: true,
                path: path.resolve(filePath),
                fileName: path.basename(filePath),
                sizeBytes: stat.size,
                headHex: head.toString("hex"),
                tailHex: tail.toString("hex"),
                jpegStart: head.length >= 2 && head[0] === 0xff && head[1] === 0xd8,
                jpegEnd: tail.length >= 2 && tail[tail.length - 2] === 0xff && tail[tail.length - 1] === 0xd9
            };
        }
        catch (err) {
            return {
                exists: fs.existsSync(filePath),
                path: path.resolve(filePath),
                debugError: err?.message || String(err || "")
            };
        }
    }
    preserveDebugFile(filePath, label, ctx = {}) {
        try {
            if (!fs.existsSync(filePath)) {
                return this.getLocalFileDebug(filePath);
            }
            const safeLabel = String(label || "media")
                .replace(/[^a-zA-Z0-9_-]+/g, "_")
                .slice(0, 80);
            const contextParts = [
                ctx?.row ? `row${ctx.row}` : "",
                ctx?.videoId ? `video${ctx.videoId}` : "",
                ctx?.postId ? `post${ctx.postId}` : "",
                ctx?.surfId ? `surf${ctx.surfId}` : ""
            ].filter(Boolean);
            const debugDir = path.resolve("data", "debug", "thumbnails");
            fs.mkdirSync(debugDir, { recursive: true });
            const ext = path.extname(filePath) || ".bin";
            const base = path.basename(filePath, ext);
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const debugFileName = [timestamp, safeLabel, ...contextParts, base].filter(Boolean).join("_") + ext;
            const debugPath = path.join(debugDir, debugFileName);
            fs.copyFileSync(filePath, debugPath);
            return {
                ...this.getLocalFileDebug(filePath),
                debugPath
            };
        }
        catch (err) {
            return {
                ...this.getLocalFileDebug(filePath),
                debugPreserveError: err?.message || String(err || "")
            };
        }
    }
    async probeVideoInfo(videoPath) {
        const size = fs.statSync(videoPath).size;
        const metadata = await new Promise((resolve, reject) => {
            ffmpeg.ffprobe(videoPath, (err, data) => {
                if (err)
                    reject(err);
                else
                    resolve(data);
            });
        });
        const videoStream = metadata?.streams?.find((stream) => stream.codec_type === "video") || {};
        const duration = Number(videoStream.duration || metadata?.format?.duration || 0);
        return {
            width: Number(videoStream.width || 0),
            height: Number(videoStream.height || 0),
            duration,
            size,
            path: videoPath
        };
    }
    async createVideoThumbnail(videoPath, outputPath) {
        const trySceneDetection = await new Promise((resolve) => {
            ffmpeg(videoPath)
                .outputOptions([
                "-vf", "select=gt(scene\\,0.3)",
                "-vsync", "vfr",
                "-frames:v", "1",
                "-q:v", "2"
            ])
                .output(outputPath)
                .on("end", () => {
                resolve(fs.existsSync(outputPath));
            })
                .on("error", (err) => {
                this.logger.warn("SCENE_DETECTION_FAILED", { err: err.message, videoPath });
                resolve(false);
            })
                .run();
        });
        if (!trySceneDetection) {
            await new Promise((resolve, reject) => {
                ffmpeg(videoPath)
                    .seekInput(1.5)
                    .outputOptions(["-frames:v 1", "-q:v 2"])
                    .output(outputPath)
                    .on("end", () => resolve())
                    .on("error", (err) => reject(err))
                    .run();
            });
        }
        await this.sanitizeJpegThumbnail(outputPath);
        return outputPath;
    }
    async sanitizeJpegThumbnail(outputPath) {
        if (!fs.existsSync(outputPath))
            return;
        const tempPath = `${outputPath}.clean-${process.pid}-${Date.now()}.jpg`;
        try {
            await new Promise((resolve, reject) => {
                ffmpeg(outputPath)
                    .outputOptions([
                    "-map_metadata", "-1",
                    "-fflags", "+bitexact",
                    "-flags:v", "+bitexact",
                    "-frames:v", "1",
                    "-q:v", "3"
                ])
                    .output(tempPath)
                    .on("end", () => resolve())
                    .on("error", (err) => reject(err))
                    .run();
            });
            if (fs.existsSync(tempPath) && fs.statSync(tempPath).size > 0) {
                fs.renameSync(tempPath, outputPath);
            }
        }
        catch (err) {
            if (fs.existsSync(tempPath)) {
                try {
                    fs.unlinkSync(tempPath);
                }
                catch { }
            }
            this.logger.warn("THUMBNAIL_SANITIZE_FAILED", {
                filePath: outputPath,
                err: err?.message || String(err || "")
            });
        }
    }
    padMediaMetric(value) {
        const safe = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
        return String(safe).padStart(4, "0");
    }
    extractPresignedUrl(response) {
        let url = response?.data?.data?.url
            || response?.data?.data?.presignedUrl
            || response?.data?.data?.uploadUrl
            || response?.data?.url
            || response?.data?.presignedUrl
            || response?.data?.uploadUrl
            || "";
        const publicBaseUrl = String(env_1.ENV.UPLOAD_PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
        if (!url)
            return "";
        if (url.startsWith("/")) {
            return publicBaseUrl ? `${publicBaseUrl}${url}` : url;
        }
        return url;
    }
    extractPresignedFields(response) {
        return response?.data?.data?.fields
            || response?.data?.data?.formData
            || response?.data?.data?.form
            || response?.data?.fields
            || response?.data?.formData
            || response?.data?.form
            || undefined;
    }
    extractUploadedObjectRef(response, fallbackFileName) {
        const fields = this.extractPresignedFields(response);
        if (fields?.key)
            return String(fields.key);
        const direct = response?.data?.data?.objectKey
            || response?.data?.data?.key
            || response?.data?.data?.fileName
            || response?.data?.data?.name
            || response?.data?.objectKey
            || response?.data?.key
            || response?.data?.fileName
            || response?.data?.name;
        if (direct)
            return String(direct);
        return fallbackFileName;
    }
    extractUploadedFileName(response, fallbackFileName) {
        const direct = response?.data?.data?.fileName
            || response?.data?.data?.name
            || response?.data?.fileName
            || response?.data?.name;
        if (direct)
            return path.basename(String(direct));
        const objectRef = this.extractUploadedObjectRef(response, fallbackFileName);
        return path.basename(String(objectRef || fallbackFileName));
    }
    async uploadMediaViaPresignedLink(accessToken, payload, filePath, mimeType, headers, ctx, logLabel, requestOptions) {
        this.logger.info(`${logLabel}_PRESIGNED_REQUEST`, { ...ctx, payload });
        let presignedLinkResponse;
        try {
            presignedLinkResponse = await mediaApiService_1.MediaApiService.requestUploadUrl(accessToken, payload, headers, this.proxyAgent, requestOptions);
        }
        catch (err) {
            this.logger.error(`${logLabel}_PRESIGNED_REQUEST_FAILED`, {
                ...ctx,
                payload,
                ...this.extractHttpFailureDebug(err)
            });
            throw err;
        }
        const uploadUrl = this.extractPresignedUrl(presignedLinkResponse);
        const uploadFields = this.extractPresignedFields(presignedLinkResponse);
        const objectRef = this.extractUploadedObjectRef(presignedLinkResponse, path.basename(filePath));
        const fileName = this.extractUploadedFileName(presignedLinkResponse, path.basename(filePath));
        this.logger.info(`${logLabel}_PRESIGNED_RESPONSE`, {
            ...ctx,
            uploadUrl,
            objectRef,
            fileName,
            uploadFields,
            responseData: presignedLinkResponse?.data
        });
        if (!uploadUrl) {
            this.logger.error(`${logLabel}_PRESIGNED_MISSING_URL`, { ...ctx, responseData: presignedLinkResponse?.data });
            throw new Error(`Failed to get presigned URL for ${logLabel}`);
        }
        let uploadRes;
        try {
            uploadRes = await mediaApiService_1.MediaApiService.uploadMediaToS3(uploadUrl, fs.readFileSync(filePath), mimeType, path.basename(filePath), uploadFields);
        }
        catch (err) {
            this.logger.error(`${logLabel}_S3_UPLOAD_FAILED`, {
                ...ctx,
                filePath: path.basename(filePath),
                uploadUrl,
                objectRef,
                fileName,
                uploadFields,
                ...this.extractHttpFailureDebug(err)
            });
            throw err;
        }
        this.logger.info(`${logLabel}_S3_UPLOAD_SUCCESS`, {
            ...ctx,
            filePath: path.basename(filePath),
            objectRef,
            uploadAttempt: uploadRes?.uploadAttempt || "form-data"
        });
        return {
            objectRef,
            fileName,
            uploadUrl,
            uploadFields,
            responseData: presignedLinkResponse?.data
        };
    }
    async uploadFeedThumbnailDirect(accessToken, feedId, filePath, fileName, headers, ctx, logLabel, lastFile = true) {
        const fileSizeBytes = fs.statSync(filePath).size;
        const formData = new form_data_1.default();
        formData.append("file", fs.readFileSync(filePath), {
            filename: fileName,
            contentType: "image/jpeg"
        });
        formData.append("feedId", String(feedId));
        formData.append("lastFile", lastFile ? "true" : "false");
        const uploadHeaders = {
            "User-Agent": "ERIC/1.0.0 (iOS; 18.7.7; iPhone XS Max)", // Match real app UA from user logs
            ...headers
        };
        // Check if a preferred base URL was passed in headers (internal signal)
        const forcedBaseUrl = headers._preferredBaseUrl;
        const skipSignature = headers._skipSignature === true;
        this.logger.info(`${logLabel}_DIRECT_UPLOAD_REQUEST`, {
            ...ctx,
            feedId: String(feedId),
            fileName,
            lastFile,
            fileSizeBytes,
            formFieldNames: ["file", "feedId", "lastFile"],
            skipSignature
        });
        let uploadResponse;
        try {
            uploadResponse = await mediaApiService_1.MediaApiService.uploadMedia(accessToken, formData, uploadHeaders, this.proxyAgent, {
                preferredBaseUrl: forcedBaseUrl || env_1.ENV.MEDIA_API_URL || env_1.ENV.KONG_URL,
                allowFallbackBaseUrls: false,
                skipSignature
            });
        }
        catch (err) {
            this.logger.error(`${logLabel}_DIRECT_UPLOAD_FAILED`, {
                ...ctx,
                feedId: String(feedId),
                fileName,
                lastFile,
                fileSizeBytes,
                ...this.extractHttpFailureDebug(err)
            });
            throw err;
        }
        const uploadedFileName = this.extractUploadedFileName(uploadResponse, fileName);
        this.logger.info(`${logLabel}_DIRECT_UPLOAD_SUCCESS`, {
            ...ctx,
            feedId: String(feedId),
            fileName: uploadedFileName,
            responseData: uploadResponse?.data
        });
        return {
            fileName: uploadedFileName,
            responseData: uploadResponse?.data
        };
    }
    async deleteBrokenVideo(video, ctx, reason, err, logPrefix = "BROKEN_VIDEO") {
        const localPath = String(video?.local_path || "");
        try {
            if (localPath && fs.existsSync(localPath)) {
                fs.unlinkSync(localPath);
            }
        }
        catch (deleteErr) {
            this.logger.warn(`${logPrefix}_FILE_DELETE_FAILED`, {
                ...ctx,
                videoId: video.id,
                localPath,
                reason,
                err: deleteErr?.message
            });
        }
        try {
            await (0, mysqlStore_1.deleteVideoFromQueue)(video.id);
        }
        catch (dbErr) {
            this.logger.warn(`${logPrefix}_DB_DELETE_FAILED`, {
                ...ctx,
                videoId: video.id,
                reason,
                err: dbErr?.message
            });
        }
        this.logger.warn(`${logPrefix}_REMOVED`, {
            ...ctx,
            videoId: video.id,
            source: video.source_url,
            localPath,
            reason,
            err: err?.message || String(err || "")
        });
    }
}
exports.MediaHelper = MediaHelper;
