import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import { SurfApiService } from "../../api/surf/surfApiService";
import { getNextVideoToPost, markVideoPosted, releaseVideoReservation } from "../../data/mysqlStore";
import { Log } from "../../utils/log";
import { MediaHelper } from "../../utils/MediaHelper";

type AppLogger = ReturnType<typeof Log.getLogger>;

export class SurfService {
    private static surfQueue: Promise<void> = Promise.resolve();
    private mediaHelper: MediaHelper;

    constructor(
        private readonly logger: AppLogger,
        private readonly acc: any,
        private readonly proxyAgent: any
    ) {
        this.mediaHelper = new MediaHelper(logger, proxyAgent);
    }

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

    private buildSurfCompletePayload(
        surfId: string,
        uploadedVideoFileName: string,
        uploadedThumbFileName: string,
        videoInfo: { width: number; height: number; duration: number; }
    ) {
        return {
            id: surfId,
            content: "",
            media: `${path.basename(uploadedVideoFileName)}/${this.mediaHelper.padMediaMetric(videoInfo.width)}/${this.mediaHelper.padMediaMetric(videoInfo.height)}/${this.mediaHelper.padMediaMetric(videoInfo.duration)}`,
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
                            await this.mediaHelper.deleteBrokenVideo(video, ctx, "FILE_NOT_FOUND", err, "BROKEN_SURF_VIDEO");
                            throw err;
                        }

                        const fileSizeBytes = fs.statSync(videoPath).size;
                        const MAX_SIZE = 5 * 1024 * 1024;

                        if (fileSizeBytes > MAX_SIZE) {
                            const err = new Error(`Video too large: ${(fileSizeBytes / 1024 / 1024).toFixed(2)}MB`);
                            await this.mediaHelper.deleteBrokenVideo(video, ctx, "FILE_TOO_LARGE", err, "BROKEN_SURF_VIDEO");
                            throw err;
                        }

                        const uploadBaseName = randomUUID();
                        const uploadVideoName = `${uploadBaseName}.mp4`;
                        const uploadThumbName = `${uploadBaseName}.jpg`;
                        const thumbnailPath = path.join(path.dirname(videoPath), uploadThumbName);

                        let videoInfo;
                        let thumbnailSize: number;

                        try {
                            videoInfo = await this.mediaHelper.probeVideoInfo(videoPath);
                            await this.mediaHelper.createVideoThumbnail(videoPath, thumbnailPath);
                            thumbnailSize = fs.statSync(thumbnailPath).size;
                        } catch (err: any) {
                            if (fs.existsSync(thumbnailPath)) {
                                try { fs.unlinkSync(thumbnailPath); } catch (e) { }
                            }
                            await this.mediaHelper.deleteBrokenVideo(video, ctx, "LOCAL_VIDEO_PROCESSING_FAILED", err, "BROKEN_SURF_VIDEO");
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
                            const thumbUpload = await this.mediaHelper.uploadMediaViaPresignedLink(
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

                            const videoUpload = await this.mediaHelper.uploadMediaViaPresignedLink(
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
