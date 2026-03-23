import * as fs from "fs";
import * as path from "path";
import { MediaApiService } from "../../api/media/mediaApiService";
import { PostApiService } from "../../api/post/postApiService";
import { deleteVideoFromQueue, getNextVideoToPost, markVideoPosted, releaseVideoReservation } from "../../data/mysqlStore";
import { Log } from "../../utils/log";
const ffmpeg = require("fluent-ffmpeg");
const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

type AppLogger = ReturnType<typeof Log.getLogger>;

export class PostService {
    constructor(
        private readonly logger: AppLogger,
        private readonly acc: any,
        private readonly proxyAgent: any
    ) { }

    private normalizeText(text: string) {
        return String(text || "")
            .replace(/\r\n/g, "\n")
            .replace(/\n{3,}/g, "\n\n")
            .replace(/[ \t]+\n/g, "\n")
            .replace(/\n[ \t]+/g, "\n")
            .trim();
    }

    private createPostContent(postText: string, layout: any | null) {
        let postContent = "";
        const normalizedText = this.normalizeText(postText);

        if (normalizedText) {
            postContent = `!{"text": ${JSON.stringify(normalizedText)}}`;
        }

        if (layout && Array.isArray(layout.slots) && layout.slots.length > 0) {
            postContent = postContent
                ? `${postContent}, !{"layout": ${JSON.stringify(layout)}}`
                : `!{"layout": ${JSON.stringify(layout)}}`;
        }

        return postContent;
    }

    private padMediaMetric(value: number) {
        return String(Math.max(0, Math.round(value || 0))).padStart(4, "0");
    }

    private normalizeArrayString(value?: string) {
        const text = String(value || "").trim();
        return text.startsWith("[") ? text : "[]";
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

    private async uploadMediaViaPresignedLink(
        accessToken: string,
        payload: any,
        filePath: string,
        mimeType: string,
        headers: any,
        ctx: any,
        logLabel: string
    ) {
        this.logger.info(`${logLabel}_PRESIGNED_REQUEST`, { ...ctx, payload });
        const presignedLinkResponse = await MediaApiService.requestUploadUrl(accessToken, payload, headers, this.proxyAgent);
        const uploadUrl = this.extractPresignedUrl(presignedLinkResponse);
        const uploadFields = this.extractPresignedFields(presignedLinkResponse);

        this.logger.info(`${logLabel}_PRESIGNED_RESPONSE`, {
            ...ctx,
            uploadUrl,
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
            uploadAttempt: uploadRes?.uploadAttempt || "unknown"
        });
    }

    private async deleteBrokenVideo(video: { id: number; local_path: string; source_url?: string; }, ctx: any, reason: string, err?: any) {
        const localPath = String(video?.local_path || "");

        try {
            if (localPath && fs.existsSync(localPath)) {
                fs.unlinkSync(localPath);
            }
        } catch (deleteErr: any) {
            this.logger.warn("BROKEN_VIDEO_FILE_DELETE_FAILED", {
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
            this.logger.warn("BROKEN_VIDEO_DB_DELETE_FAILED", {
                ...ctx,
                videoId: video.id,
                reason,
                err: dbErr?.message
            });
        }

        this.logger.warn("BROKEN_VIDEO_REMOVED", {
            ...ctx,
            videoId: video.id,
            source: video.source_url,
            localPath,
            reason,
            err: err?.message || String(err || "")
        });
    }

    async handleAutoCreatePost(accessToken: string, h: any, ctx: any, doMission: Function) {
        const phone = String(this.acc.phone || "").trim();
        const maxVideoAttempts = 3;

        for (let attempt = 1; attempt <= maxVideoAttempts; attempt++) {
            const video = await getNextVideoToPost(phone).catch(() => null);

            if (!video) {
                break;
            }

            this.logger.info("VIDEO_POST_START", { ...ctx, videoId: video.id, source: video.source_url, attempt });

            try {
                await doMission("CreateVideoPost", async () => {
                const videoPath = video.local_path;

                if (!fs.existsSync(videoPath)) {
                    const err = new Error(`Video file not found: ${videoPath}`);
                    await this.deleteBrokenVideo(video, ctx, "FILE_NOT_FOUND", err);
                    throw err;
                }

                const fileSizeBytes = fs.statSync(videoPath).size;
                const MAX_SIZE = 5 * 1024 * 1024;

                if (fileSizeBytes > MAX_SIZE) {
                    this.logger.warn("VIDEO_TOO_LARGE_SKIPPING", { ...ctx, sizeMB: (fileSizeBytes / (1024 * 1024)).toFixed(2) });
                    const err = new Error(`Video too large: ${(fileSizeBytes / 1024 / 1024).toFixed(2)}MB`);
                    await this.deleteBrokenVideo(video, ctx, "FILE_TOO_LARGE", err);
                    throw err;
                }

                const baseName = path.parse(videoPath).name;
                const uploadVideoName = `${baseName}.mp4`;
                const uploadThumbName = `${baseName}.jpg`;
                const thumbnailPath = path.join(path.dirname(videoPath), uploadThumbName);
                let videoInfo: Awaited<ReturnType<PostService["probeVideoInfo"]>>;
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

                const generatePostIdResponse = await PostApiService.generateId(accessToken, h, this.proxyAgent);
                const postId = generatePostIdResponse?.data?.data || generatePostIdResponse?.data?.id;

                this.logger.info("VIDEO_POST_ID_GENERATED", {
                    ...ctx,
                    postId: String(postId || ""),
                    responseData: generatePostIdResponse?.data
                });

                if (!postId) {
                    throw new Error("Failed to generate post ID");
                }

                this.logger.info("VIDEO_UPLOAD_REQUEST_PREPARED", {
                    ...ctx,
                    postId: String(postId),
                    fileName: uploadVideoName,
                    fileSizeBytes,
                    thumbnailFileName: uploadThumbName,
                    uploadMode: "presigned+complete",
                    width: videoInfo.width,
                    height: videoInfo.height,
                    duration: videoInfo.duration
                });

                try {
                    await this.uploadMediaViaPresignedLink(
                        accessToken,
                        {
                            entityId: String(postId),
                            type: "POST",
                            purpose: "POST_THUMBNAIL",
                            fileName: uploadThumbName,
                            fileSize: thumbnailSize,
                            mimeType: "IMAGE_JPEG",
                            lastFile: false
                        },
                        thumbnailPath,
                        "image/jpeg",
                        h,
                        ctx,
                        "VIDEO_THUMBNAIL"
                    );

                    await this.uploadMediaViaPresignedLink(
                        accessToken,
                        {
                            entityId: String(postId),
                            type: "POST",
                            purpose: "POST_VIDEO",
                            fileName: uploadVideoName,
                            fileSize: videoInfo.size,
                            mimeType: "VIDEO_MP4",
                            lastFile: true
                        },
                        videoPath,
                        "video/mp4",
                        h,
                        ctx,
                        "VIDEO_FILE"
                    );
                } finally {
                    if (fs.existsSync(thumbnailPath)) {
                        try { fs.unlinkSync(thumbnailPath); } catch (e) { }
                    }
                }

                const layout = {
                    grid: "2-2",
                    slots: [{
                        pos: "1-1-2-2",
                        media: `${uploadVideoName}/${this.padMediaMetric(videoInfo.width)}/${this.padMediaMetric(videoInfo.height)}/${this.padMediaMetric(videoInfo.duration)}`,
                        type: "VIDEO",
                        thumb: `${uploadThumbName}/${this.padMediaMetric(videoInfo.width)}/${this.padMediaMetric(videoInfo.height)}`
                    }]
                };

                const completePayload = {
                    id: String(postId),
                    content: this.createPostContent("", layout),
                    type: "POST",
                    privacy: "PUBLIC",
                    hashtags: "[]",
                    mentions: "[]",
                    tags: "[]",
                    checkinLocation: JSON.stringify({ lat: 0, lon: 0, source: "GPS", name: "" }),
                    backgroundColor: 1,
                    feeling: 1,
                    listImage: "[]",
                    listVideo: JSON.stringify([uploadVideoName])
                };

                this.logger.info("VIDEO_POST_COMPLETE_REQUEST", {
                    ...ctx,
                    postId: String(postId),
                    payload: completePayload
                });

                const completePostResponse = await PostApiService.completePost(accessToken, completePayload, h, this.proxyAgent);
                this.logger.info("VIDEO_POST_COMPLETE_RESPONSE", {
                    ...ctx,
                    postId: String(postId),
                    responseData: completePostResponse?.data,
                    status: completePostResponse?.status
                });

                const posted = await markVideoPosted(video.id, phone).catch(() => null);
                if (posted?.fullyPosted && posted.localPath) {
                    if (fs.existsSync(posted.localPath)) {
                        try {
                            fs.unlinkSync(posted.localPath);
                            this.logger.info("SOURCE_VIDEO_DELETED_AFTER_MAX_POSTS", { videoId: video.id });
                        } catch (e) { }
                    }
                }

                    return completePostResponse;
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
                    this.logger.warn("BROKEN_VIDEO_RETRY_NEXT", {
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

        this.logger.info("NO_VIDEO_AVAILABLE_SKIP_POST", ctx);
    }
}
