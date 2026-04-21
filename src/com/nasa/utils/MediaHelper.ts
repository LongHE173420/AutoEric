import * as fs from "fs";
import * as path from "path";
import FormData from "form-data";
import { ENV } from "../config/env";
import { MediaApiService } from "../api/media/mediaApiService";
import { deleteVideoFromQueue } from "../data/mysqlStore";
const ffmpeg = require("fluent-ffmpeg");
const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export class MediaHelper {
    constructor(
        private readonly logger: any,
        private readonly proxyAgent: any
    ) { }

    private stringifyForLog(data: any, maxLength = 2000): string | undefined {
        try {
            if (data === undefined || data === null) return undefined;
            return (typeof data === "string" ? data : JSON.stringify(data)).slice(0, maxLength);
        } catch {
            return undefined;
        }
    }

    private extractHttpFailureDebug(err: any) {
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

    async probeVideoInfo(videoPath: string): Promise<{ width: number; height: number; duration: number; size: number; path: string; }> {
        const size = fs.statSync(videoPath).size;

        const metadata = await new Promise<any>((resolve, reject) => {
            ffmpeg.ffprobe(videoPath, (err: any, data: any) => {
                if (err) reject(err);
                else resolve(data);
            });
        });

        const videoStream = metadata?.streams?.find((stream: any) => stream.codec_type === "video") || {};
        const duration = Number(videoStream.duration || metadata?.format?.duration || 0);

        return {
            width: Number(videoStream.width || 0),
            height: Number(videoStream.height || 0),
            duration,
            size,
            path: videoPath
        };
    }

    async createVideoThumbnail(videoPath: string, outputPath: string): Promise<string> {
        const trySceneDetection = await new Promise<boolean>((resolve) => {
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
                .on("error", (err: any) => {
                    this.logger.warn("SCENE_DETECTION_FAILED", { err: err.message, videoPath });
                    resolve(false);
                })
                .run();
        });

        if (!trySceneDetection) {
            await new Promise<void>((resolve, reject) => {
                ffmpeg(videoPath)
                    .seekInput(1.5)
                    .outputOptions(["-frames:v 1", "-q:v 2"])
                    .output(outputPath)
                    .on("end", () => resolve())
                    .on("error", (err: any) => reject(err))
                    .run();
            });
        }

        return outputPath;
    }

    padMediaMetric(value: number) {
        const safe = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
        return String(safe).padStart(4, "0");
    }

    extractPresignedUrl(response: any): string {
        let url = response?.data?.data?.url
            || response?.data?.data?.presignedUrl
            || response?.data?.data?.uploadUrl
            || response?.data?.url
            || response?.data?.presignedUrl
            || response?.data?.uploadUrl
            || "";

        const publicBaseUrl = String(ENV.UPLOAD_PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
        if (!url) return "";

        if (url.startsWith("/")) {
            return publicBaseUrl ? `${publicBaseUrl}${url}` : url;
        }

        return url;
    }

    extractPresignedFields(response: any): Record<string, any> | undefined {
        return response?.data?.data?.fields
            || response?.data?.data?.formData
            || response?.data?.data?.form
            || response?.data?.fields
            || response?.data?.formData
            || response?.data?.form
            || undefined;
    }

    extractUploadedObjectRef(response: any, fallbackFileName: string): string {
        const fields = this.extractPresignedFields(response);
        if (fields?.key) return String(fields.key);

        const direct =
            response?.data?.data?.objectKey
            || response?.data?.data?.key
            || response?.data?.data?.fileName
            || response?.data?.data?.name
            || response?.data?.objectKey
            || response?.data?.key
            || response?.data?.fileName
            || response?.data?.name;

        if (direct) return String(direct);

        return fallbackFileName;
    }

    extractUploadedFileName(response: any, fallbackFileName: string): string {
        const direct =
            response?.data?.data?.fileName
            || response?.data?.data?.name
            || response?.data?.fileName
            || response?.data?.name;

        if (direct) return path.basename(String(direct));

        const objectRef = this.extractUploadedObjectRef(response, fallbackFileName);
        return path.basename(String(objectRef || fallbackFileName));
    }

    async uploadMediaViaPresignedLink(
        accessToken: string,
        payload: any,
        filePath: string,
        mimeType: string,
        headers: any,
        ctx: any,
        logLabel: string,
        requestOptions?: { preferredBaseUrl?: string; allowFallbackBaseUrls?: boolean; }
    ): Promise<{ objectRef: string; fileName: string; uploadUrl: string; uploadFields?: Record<string, any>; responseData: any; }> {
        this.logger.info(`${logLabel}_PRESIGNED_REQUEST`, { ...ctx, payload });
        let presignedLinkResponse: any;

        try {
            presignedLinkResponse = await MediaApiService.requestUploadUrl(accessToken, payload, headers, this.proxyAgent, requestOptions);
        } catch (err: any) {
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

        let uploadRes: any;
        try {
            uploadRes = await MediaApiService.uploadMediaToS3(
                uploadUrl,
                fs.readFileSync(filePath),
                mimeType,
                path.basename(filePath),
                uploadFields
            );
        } catch (err: any) {
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
            uploadAttempt: (uploadRes as any)?.uploadAttempt || "form-data"
        });

        return {
            objectRef,
            fileName,
            uploadUrl,
            uploadFields,
            responseData: presignedLinkResponse?.data
        };
    }

    async uploadFeedThumbnailDirect(
        accessToken: string,
        feedId: string,
        filePath: string,
        fileName: string,
        headers: any,
        ctx: any,
        logLabel: string,
        lastFile: boolean = true
    ): Promise<{ fileName: string; responseData: any; }> {
        const fileSizeBytes = fs.statSync(filePath).size;
        const formData = new FormData();
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
        const forcedBaseUrl = (headers as any)._preferredBaseUrl;
        const skipSignature = (headers as any)._skipSignature === true;

        this.logger.info(`${logLabel}_DIRECT_UPLOAD_REQUEST`, {
            ...ctx,
            feedId: String(feedId),
            fileName,
            lastFile,
            fileSizeBytes,
            formFieldNames: ["file", "feedId", "lastFile"],
            skipSignature
        });

        let uploadResponse: any;
        try {
            uploadResponse = await MediaApiService.uploadMedia(accessToken, formData, uploadHeaders, this.proxyAgent, {
                preferredBaseUrl: forcedBaseUrl || (ENV as any).MEDIA_UPLOAD_API_URL || ENV.MEDIA_API_URL || ENV.KONG_URL,
                allowFallbackBaseUrls: false,
                skipSignature
            });
        } catch (err: any) {
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

    async deleteBrokenVideo(
        video: { id: number; local_path: string; source_url?: string; },
        ctx: any,
        reason: string,
        err?: any,
        logPrefix: string = "BROKEN_VIDEO"
    ) {
        const localPath = String(video?.local_path || "");

        try {
            if (localPath && fs.existsSync(localPath)) {
                fs.unlinkSync(localPath);
            }
        } catch (deleteErr: any) {
            this.logger.warn(`${logPrefix}_FILE_DELETE_FAILED`, {
                ...ctx,
                videoId: video.id,
                localPath,
                reason,
                err: deleteErr?.message
            });
        }

        try {
            await deleteVideoFromQueue(video.id);
        } catch (dbErr: any) {
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
