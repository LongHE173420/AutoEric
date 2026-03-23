import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import { MediaApiService } from "../../api/media/mediaApiService";
import { SurfApiService } from "../../api/surf/surfApiService";
import { deleteVideoFromQueue, getNextVideoToPost, markVideoPosted, releaseVideoReservation } from "../../data/mysqlStore";
import { Log } from "../../utils/log";

const ffmpeg = require("fluent-ffmpeg");
const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

type AppLogger = ReturnType<typeof Log.getLogger>;

export class SurfService {
    private static surfQueue: Promise<void> = Promise.resolve();

    constructor(
        private readonly logger: AppLogger,
        private readonly acc: any,
        private readonly proxyAgent: any
    ) { }

    private async runSequentialSurf<T>(work: () => Promise<T>): Promise<T> {
        const previous = SurfService.surfQueue;
        let release!: () => void;
        SurfService.surfQueue = new Promise<void>((resolve) => {
            release = resolve;
        });

        await previous;
        try {
            return await work();
        } finally {
            release();
        }
    }

    private async probeVideoInfo(videoPath: string): Promise<{ width: number; height: number; duration: number; size: number; path: string; }> {
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

    private async createVideoThumbnail(videoPath: string, outputPath: string): Promise<string> {
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

    private padMediaMetric(value: number) {
        const safe = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
        return String(safe).padStart(4, "0");
    }

    private extractPresignedUrl(response: any): string {
        return response?.data?.data?.url
            || response?.data?.data?.presignedUrl
            || response?.data?.data?.uploadUrl
            || response?.data?.url
            || response?.data?.presignedUrl
            || response?.data?.uploadUrl
            || "";
    }

    private extractPresignedFields(response: any): Record<string, any> | undefined {
        return response?.data?.data?.fields
            || response?.data?.data?.formData
            || response?.data?.data?.form
            || response?.data?.fields
            || response?.data?.formData
            || response?.data?.form
            || undefined;
    }

    private extractUploadedObjectRef(response: any, fallbackFileName: string): string {
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

    private extractUploadedFileName(response: any, fallbackFileName: string): string {
        const direct =
            response?.data?.data?.fileName
            || response?.data?.data?.name
            || response?.data?.fileName
            || response?.data?.name;

        if (direct) return path.basename(String(direct));

        const objectRef = this.extractUploadedObjectRef(response, fallbackFileName);
        return path.basename(String(objectRef || fallbackFileName));
    }

    private async uploadMediaViaPresignedLink(
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

    private async deleteBrokenVideo(video: { id: number; local_path: string; source_url?: string; }, ctx: any, reason: string, err?: any) {
        const localPath = String(video?.local_path || "");

        try {
            if (localPath && fs.existsSync(localPath)) {
                fs.unlinkSync(localPath);
            }
        } catch (deleteErr: any) {
            this.logger.warn("BROKEN_SURF_VIDEO_FILE_DELETE_FAILED", {
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
            this.logger.warn("BROKEN_SURF_VIDEO_DB_DELETE_FAILED", {
                ...ctx,
                videoId: video.id,
                reason,
                err: dbErr?.message
            });
        }

        this.logger.warn("BROKEN_SURF_VIDEO_REMOVED", {
            ...ctx,
            videoId: video.id,
            source: video.source_url,
            localPath,
            reason,
            err: err?.message || String(err || "")
        });
    }

    private buildSurfCompletePayload(
        surfId: string,
        uploadedVideoFileName: string,
        uploadedThumbFileName: string,
        videoInfo: { width: number; height: number; duration: number; }
    ) {
        return {
            id: surfId,
            content: "",
            media: `${path.basename(uploadedVideoFileName)}/${this.padMediaMetric(videoInfo.width)}/${this.padMediaMetric(videoInfo.height)}/${this.padMediaMetric(videoInfo.duration)}`,
            mediaType: "VIDEO",
            privacy: "PUBLIC",
            allowComments: true,
            thumbnailFileName: path.basename(uploadedThumbFileName),
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
    }

    async handleAutoCreateSurf(accessToken: string, h: any, ctx: any, doMission: Function) {
        await this.runSequentialSurf(async () => {
            const phone = String(this.acc.phone || "").trim();
            const maxVideoAttempts = 3;

            for (let attempt = 1; attempt <= maxVideoAttempts; attempt++) {
                const video = await getNextVideoToPost(phone).catch(() => null);
                if (!video) break;

                this.logger.info("SURF_VIDEO_START", { ...ctx, videoId: video.id, source: video.source_url, attempt });

                try {
                    await doMission("CreateSurf", async () => {
                        const videoPath = video.local_path;

                        if (!fs.existsSync(videoPath)) {
                            const err = new Error(`Video file not found: ${videoPath}`);
                            await this.deleteBrokenVideo(video, ctx, "FILE_NOT_FOUND", err);
                            throw err;
                        }

                        const fileSizeBytes = fs.statSync(videoPath).size;
                        const MAX_SIZE = 5 * 1024 * 1024;

                        if (fileSizeBytes > MAX_SIZE) {
                            const err = new Error(`Video too large: ${(fileSizeBytes / 1024 / 1024).toFixed(2)}MB`);
                            await this.deleteBrokenVideo(video, ctx, "FILE_TOO_LARGE", err);
                            throw err;
                        }

                        const uploadBaseName = randomUUID();
                        const uploadVideoName = `${uploadBaseName}.mp4`;
                        const uploadThumbName = `${uploadBaseName}.jpg`;
                        const thumbnailPath = path.join(path.dirname(videoPath), uploadThumbName);

                        let videoInfo: Awaited<ReturnType<SurfService["probeVideoInfo"]>>;
                        let thumbnailSize: number;

                        try {
                            videoInfo = await this.probeVideoInfo(videoPath);
                            await this.createVideoThumbnail(videoPath, thumbnailPath);
                            thumbnailSize = fs.statSync(thumbnailPath).size;
                        } catch (err: any) {
                            if (fs.existsSync(thumbnailPath)) {
                                try { fs.unlinkSync(thumbnailPath); } catch (e) { }
                            }
                            await this.deleteBrokenVideo(video, ctx, "LOCAL_VIDEO_PROCESSING_FAILED", err);
                            throw err;
                        }

                        const generateSurfIdResponse = await SurfApiService.generateId(accessToken, h, this.proxyAgent);
                        const surfId = generateSurfIdResponse?.data?.data || generateSurfIdResponse?.data?.id;

                        this.logger.info("SURF_ID_GENERATED", {
                            ...ctx,
                            surfId: String(surfId || ""),
                            responseData: generateSurfIdResponse?.data
                        });

                        if (!surfId) {
                            throw new Error("Failed to generate surf ID");
                        }

                        let uploadedThumbRef = uploadThumbName;
                        let uploadedVideoRef = uploadVideoName;
                        let uploadedThumbFileName = uploadThumbName;
                        let uploadedVideoFileName = uploadVideoName;

                        try {
                            const thumbUpload = await this.uploadMediaViaPresignedLink(
                                accessToken,
                                {
                                    entityId: String(surfId),
                                    type: "SURF",
                                    purpose: "SURF_THUMBNAIL",
                                    fileName: uploadThumbName,
                                    fileSize: thumbnailSize,
                                    mimeType: "IMAGE_JPEG",
                                    lastFile: false
                                },
                                thumbnailPath,
                                "image/jpeg",
                                h,
                                ctx,
                                "SURF_THUMBNAIL"
                            );
                            uploadedThumbRef = thumbUpload.objectRef || uploadThumbName;
                            uploadedThumbFileName = thumbUpload.fileName || uploadThumbName;

                            const videoUpload = await this.uploadMediaViaPresignedLink(
                                accessToken,
                                {
                                    entityId: String(surfId),
                                    type: "SURF",
                                    purpose: "SURF_VIDEO",
                                    fileName: uploadVideoName,
                                    fileSize: videoInfo.size,
                                    mimeType: "VIDEO_MP4",
                                    lastFile: true
                                },
                                videoPath,
                                "video/mp4",
                                h,
                                ctx,
                                "SURF_VIDEO"
                            );
                            uploadedVideoRef = videoUpload.objectRef || uploadVideoName;
                            uploadedVideoFileName = videoUpload.fileName || uploadVideoName;
                        } finally {
                            if (fs.existsSync(thumbnailPath)) {
                                try { fs.unlinkSync(thumbnailPath); } catch (e) { }
                            }
                        }

                        const completePayload = this.buildSurfCompletePayload(
                            String(surfId),
                            uploadedVideoFileName,
                            uploadedThumbFileName,
                            videoInfo
                        );

                        this.logger.info("SURF_COMPLETE_REQUEST", {
                            ...ctx,
                            surfId: String(surfId),
                            uploadRefs: {
                                thumbnailObjectRef: uploadedThumbRef,
                                videoObjectRef: uploadedVideoRef,
                                thumbnailFileName: uploadedThumbFileName,
                                videoFileName: uploadedVideoFileName
                            },
                            payload: completePayload
                        });

                        try {
                            const completeSurfResponse = await SurfApiService.completeSurf(accessToken, completePayload, h, this.proxyAgent);

                            this.logger.info("SURF_COMPLETE_RESPONSE", {
                                ...ctx,
                                surfId: String(surfId),
                                responseData: completeSurfResponse?.data,
                                status: completeSurfResponse?.status
                            });

                            const posted = await markVideoPosted(video.id, phone).catch(() => null);
                            if (posted?.fullyPosted && posted.localPath && fs.existsSync(posted.localPath)) {
                                try {
                                    fs.unlinkSync(posted.localPath);
                                    this.logger.info("SOURCE_SURF_VIDEO_DELETED_AFTER_MAX_POSTS", { videoId: video.id });
                                } catch (e) { }
                            }

                            return completeSurfResponse;
                        } catch (err: any) {
                            this.logger.warn("SURF_COMPLETE_FAILED", {
                                ...ctx,
                                surfId: String(surfId),
                                payload: completePayload,
                                status: err?.response?.status,
                                failedUrl: err?.config?.url,
                                responseData: err?.response?.data
                            });
                            throw err;
                        }
                    }, ctx);

                    return;
                } catch (err: any) {
                    await releaseVideoReservation(video?.id);
                    const isBrokenLocalVideo =
                        err?.message?.includes("Video file not found") ||
                        err?.message?.includes("Video too large") ||
                        err?.message?.includes("ffmpeg exited with code 1") ||
                        err?.message?.includes("ffprobe");

                    if (isBrokenLocalVideo && attempt < maxVideoAttempts) {
                        this.logger.warn("BROKEN_SURF_VIDEO_RETRY_NEXT", {
                            ...ctx,
                            videoId: video.id,
                            attempt,
                            nextAttempt: attempt + 1
                        });
                        continue;
                    }

                    throw err;
                }
            }
        });
    }
}
