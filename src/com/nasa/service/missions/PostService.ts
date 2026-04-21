import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import { PostApiService } from "../../api/post/postApiService";
import { markVideoPosted, getNextVideoToPost, releaseVideoReservation } from "../../data/mysqlStore";
import { Log } from "../../utils/log";
import { MediaHelper } from "../../utils/MediaHelper";

type AppLogger = ReturnType<typeof Log.getLogger>;

export class PostService {
    private readonly defaultBackgroundColor = 1;
    private mediaHelper: MediaHelper;

    constructor(
        private readonly logger: AppLogger,
        private readonly acc: any,
        private readonly proxyAgent: any
    ) {
        this.mediaHelper = new MediaHelper(logger, proxyAgent);
    }

    private normalizeText(text: string) {
        try {
            return String(text || "")
                .replace(/\r\n/g, "\n")
                .replace(/\n{3,}/g, "\n\n")
                .replace(/[ \t]+\n/g, "\n")
                .replace(/\n[ \t]+/g, "\n")
                .trim();
        } catch (e: any) {
            this.logger.error("NORMALIZE_TEXT_ERROR", { err: e.message || String(e) });
            return "";
        }
    }

    private createPostContent(postText: string, layout: any | null) {
        try {
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
        } catch (e: any) {
            this.logger.error("CREATE_POST_CONTENT_ERROR", { err: e.message || String(e) });
            return "";
        }
    }

    private buildVideoMediaRef(uploadVideoName: string, videoInfo: { width: number; height: number; duration: number; }) {
        return `${uploadVideoName}/${this.mediaHelper.padMediaMetric(videoInfo.width)}/${this.mediaHelper.padMediaMetric(videoInfo.height)}/${this.mediaHelper.padMediaMetric(videoInfo.duration)}`;
    }

    private buildCheckinLocation(name = "") {
        return JSON.stringify({
            lat: 0,
            lon: 0,
            source: "GPS",
            name
        });
    }

    private buildCreatePostPayload(
        postId: string,
        layout: any,
        uploadVideoNames: string[]
    ) {
        return {
            id: postId,
            type: "POST",
            content: this.createPostContent("", layout),
            privacy: "PUBLIC",
            hashtags: null,
            mentions: null,
            tags: null,
            checkinLocation: this.buildCheckinLocation(""),
            backgroundColor: this.defaultBackgroundColor,
            listImage: JSON.stringify([]),
            listVideo: JSON.stringify(uploadVideoNames)
        };
    }

    private buildCompletePostPayload(
        postId: string,
        layout: any,
        uploadVideoNames: string[]
    ) {
        return {
            id: postId,
            type: "POST",
            content: this.createPostContent("", layout),
            privacy: "PUBLIC",
            hashtags: null,
            mentions: null,
            tags: null,
            checkinLocation: this.buildCheckinLocation(""),
            backgroundColor: this.defaultBackgroundColor,
            listImage: JSON.stringify([]),
            listVideo: JSON.stringify(uploadVideoNames)
        };
    }

    async handleAutoCreatePost(accessToken: string, h: any, ctx: any, doMission: Function) {
        try {
            const phone = String(this.acc.phone || "").trim();
            const maxVideoAttempts = 3;

            for (let attempt = 1; attempt <= maxVideoAttempts; attempt++) {
                const video = await getNextVideoToPost(phone).catch(() => null);

                if (!video) {
                    break;
                }

                this.logger.info("VIDEO_POST_START", { ...ctx, videoId: video.id, source: video.source_url, attempt });

                const handleVideoFailure = async (err: any) => {
                    await releaseVideoReservation(video?.id).catch(() => { });
                    const isBrokenLocalVideo =
                        err?.message?.includes("Video file not found") ||
                        err?.message?.includes("Video too large") ||
                        err?.message?.includes("ffmpeg exited with code 1") ||
                        err?.message?.includes("ffprobe");

                    if (isBrokenLocalVideo && attempt < maxVideoAttempts) {
                        this.logger.warn("BROKEN_VIDEO_RETRY_NEXT", { ...ctx, videoId: video.id, attempt, nextAttempt: attempt + 1 });
                        return { action: "continue" };
                    }
                    throw err;
                };

                const executionResult = await doMission("CreateVideoPost", async () => {
                    const videoPath = video.local_path;

                    if (!fs.existsSync(videoPath)) {
                        const err = new Error(`Video file not found: ${videoPath}`);
                        await this.mediaHelper.deleteBrokenVideo(video, ctx, "FILE_NOT_FOUND", err, "BROKEN_VIDEO").catch(() => { });
                        throw err;
                    }

                    const fileSizeBytes = fs.statSync(videoPath).size;
                    const MAX_SIZE = 5 * 1024 * 1024;

                    if (fileSizeBytes > MAX_SIZE) {
                        this.logger.warn("VIDEO_TOO_LARGE_SKIPPING", { ...ctx, sizeMB: (fileSizeBytes / (1024 * 1024)).toFixed(2) });
                        const err = new Error(`Video too large: ${(fileSizeBytes / 1024 / 1024).toFixed(2)}MB`);
                        await this.mediaHelper.deleteBrokenVideo(video, ctx, "FILE_TOO_LARGE", err, "BROKEN_VIDEO").catch(() => { });
                        throw err;
                    }

                    const uploadBaseName = randomUUID();
                    const uploadVideoName = `${uploadBaseName}.mp4`;
                    const uploadThumbName = `${uploadBaseName}.jpg`;
                    const thumbnailPath = path.join(path.dirname(videoPath), uploadThumbName);

                    let videoInfo: any;
                    let thumbnailSize: number = 0;

                    await this.mediaHelper.probeVideoInfo(videoPath).then(async (info) => {
                        videoInfo = info;
                        await this.mediaHelper.createVideoThumbnail(videoPath, thumbnailPath).catch((e: any) => { throw e; });
                        thumbnailSize = fs.statSync(thumbnailPath).size;
                    }).catch(async (err: any) => {
                        if (fs.existsSync(thumbnailPath)) { try { fs.unlinkSync(thumbnailPath); } catch (e) { } }
                        await this.mediaHelper.deleteBrokenVideo(video, ctx, "LOCAL_VIDEO_PROCESSING_FAILED", err, "BROKEN_VIDEO").catch(() => { });
                        throw err;
                    });

                    const generatePostIdResponse = await PostApiService.generateId(accessToken, h, this.proxyAgent);
                    const postId = generatePostIdResponse?.data?.data || generatePostIdResponse?.data?.id;

                    this.logger.info("VIDEO_POST_ID_GENERATED", { ...ctx, postId: String(postId || ""), responseData: generatePostIdResponse?.data });

                    if (!postId) throw new Error("Failed to generate post ID");

                    this.logger.info("VIDEO_UPLOAD_REQUEST_PREPARED", { ...ctx, postId: String(postId), fileName: uploadVideoName, fileSizeBytes, thumbnailFileName: uploadThumbName, uploadMode: "thumb-presigned-or-direct+presigned+complete", width: videoInfo.width, height: videoInfo.height, duration: videoInfo.duration });

                    const uploadResult = await Promise.resolve().then(async () => {
                        // Thumbnail: dùng presigned URL flow (giống mobile app) — POST_THUMBNAIL → S3
                        let thumbUpload: any = null;
                        let thumbnailUploadSkipped = false;
                        let presignedThumbErr: any = null;

                        try {
                            thumbUpload = await this.mediaHelper.uploadMediaViaPresignedLink(
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
                        } catch (err: any) {
                            presignedThumbErr = err;
                            this.logger.warn("VIDEO_THUMBNAIL_UPLOAD_MODE_FALLBACK", {
                                ...ctx,
                                postId: String(postId),
                                failedMode: "presigned",
                                nextMode: "direct",
                                err: err?.message || String(err || "")
                            });

                            try {
                                thumbUpload = await this.mediaHelper.uploadFeedThumbnailDirect(
                                    accessToken,
                                    String(postId),
                                    thumbnailPath,
                                    uploadThumbName,
                                    h,
                                    ctx,
                                    "VIDEO_THUMBNAIL",
                                    false
                                );
                            } catch (directThumbErr: any) {
                                thumbnailUploadSkipped = true;
                                this.logger.warn("VIDEO_THUMBNAIL_UPLOAD_SKIPPED_AFTER_FAILURE", {
                                    ...ctx,
                                    postId: String(postId),
                                    failedModes: ["presigned", "direct"],
                                    presignedErr: presignedThumbErr?.message || String(presignedThumbErr || ""),
                                    directErr: directThumbErr?.message || String(directThumbErr || "")
                                });
                            }
                        }

                        const videoUpload = await this.mediaHelper.uploadMediaViaPresignedLink(
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
                        return { thumbUpload, videoUpload, thumbnailUploadSkipped };
                    }).finally(() => {
                        if (fs.existsSync(thumbnailPath)) { try { fs.unlinkSync(thumbnailPath); } catch (e) { } }
                    });

                    const uploadedVideoFileName = path.basename(uploadResult.videoUpload?.fileName || uploadVideoName);
                    const mediaRef = this.buildVideoMediaRef(uploadedVideoFileName, videoInfo);
                    const uploadedThumbFileName = uploadResult.thumbUpload?.fileName
                        ? path.basename(uploadResult.thumbUpload.fileName)
                        : "";

                    const slot: any = {
                        pos: "1-1-2-2",
                        media: mediaRef,
                        type: "VIDEO"
                    };
                    if (uploadedThumbFileName) {
                        slot.thumb = `${uploadedThumbFileName}/${this.mediaHelper.padMediaMetric(videoInfo.width)}/${this.mediaHelper.padMediaMetric(videoInfo.height)}`;
                    }

                    const layout = {
                        grid: "2-2",
                        slots: [slot]
                    };

                    const completePayload = this.buildCompletePostPayload(
                        String(postId),
                        layout,
                        [uploadedVideoFileName]
                    );

                    this.logger.info("VIDEO_POST_COMPLETE_REQUEST", {
                        ...ctx,
                        postId: String(postId),
                        thumbnailUploadSkipped: uploadResult.thumbnailUploadSkipped,
                        payload: completePayload
                    });

                    const completePostResponse = await PostApiService.completePost(accessToken, completePayload, h, this.proxyAgent);
                    this.logger.info("VIDEO_POST_COMPLETE_RESPONSE", {
                        ...ctx,
                        postId: String(postId),
                        responseData: completePostResponse?.data,
                        status: completePostResponse?.status
                    });
                    this.logger.info("VIDEO_POST_SUCCESS", {
                        ...ctx,
                        postId: String(postId),
                        videoFileName: uploadedVideoFileName
                    });

                    const posted = await markVideoPosted(video.id, phone).catch(() => null);
                    if (posted?.fullyPosted && posted.localPath && fs.existsSync(posted.localPath)) {
                        try { fs.unlinkSync(posted.localPath); this.logger.info("SOURCE_VIDEO_DELETED_AFTER_MAX_POSTS", { videoId: video.id }); } catch (e) { }
                    }
                    return { action: "success", data: completePostResponse };
                }, ctx).catch(handleVideoFailure);

                if (executionResult?.action === "continue") continue;
                return;
            }

            this.logger.info("NO_VIDEO_AVAILABLE_SKIP_POST", ctx);
        } catch (e: any) {
            this.logger.error("HANDLE_AUTO_CREATE_POST_ERROR", { ...ctx, err: e.message || String(e) });
            throw e;
        }
    }
}
