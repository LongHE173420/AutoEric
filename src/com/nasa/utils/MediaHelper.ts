import * as fs from "fs";
import * as path from "path";
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
        await new Promise<void>((resolve, reject) => {
            ffmpeg(videoPath)
                .outputOptions(["-frames:v 1", "-q:v 2"])
                .output(outputPath)
                .on("end", () => resolve())
                .on("error", (err: any) => reject(err))
                .run();
        });

        return outputPath;
    }

    padMediaMetric(value: number) {
        const safe = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
        return String(safe).padStart(4, "0");
    }

    extractPresignedUrl(response: any): string {
        return response?.data?.data?.url
            || response?.data?.data?.presignedUrl
            || response?.data?.data?.uploadUrl
            || response?.data?.url
            || response?.data?.presignedUrl
            || response?.data?.uploadUrl
            || "";
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
        logLabel: string
    ): Promise<{ objectRef: string; fileName: string; uploadUrl: string; uploadFields?: Record<string, any>; responseData: any; }> {
        this.logger.info(`${logLabel}_PRESIGNED_REQUEST`, { ...ctx, payload });
        const presignedLinkResponse = await MediaApiService.requestUploadUrl(accessToken, payload, headers, this.proxyAgent);
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

        const uploadRes = await MediaApiService.uploadMediaToS3(
            uploadUrl,
            fs.readFileSync(filePath),
            mimeType,
            path.basename(filePath),
            uploadFields
        );

        this.logger.info(`${logLabel}_S3_UPLOAD_SUCCESS`, {
            ...ctx,
            filePath: path.basename(filePath),
            objectRef,
            uploadAttempt: uploadRes?.uploadAttempt || "unknown"
        });

        return {
            objectRef,
            fileName,
            uploadUrl,
            uploadFields,
            responseData: presignedLinkResponse?.data
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
