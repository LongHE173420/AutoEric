import * as fs from "fs";
import * as path from "path";
import FormData from "form-data";
import { MediaApiService } from "../../api/media/mediaApiService";
import { FeedApiService } from "../../api/feed/feedApiService";
import { getNextVideoToPost, markVideoPosted } from "../../data/mysqlStore";
import { getRandomStatus } from "../../utils/botContent";
import { Log } from "../../utils/log";

type AppLogger = ReturnType<typeof Log.getLogger>;

export class PostService {
    constructor(
        private readonly logger: AppLogger,
        private readonly acc: any,
        private readonly proxyAgent: any
    ) {}

    async handleAutoCreatePost(accessToken: string, h: any, ctx: any, doMission: Function) {
        const phone = String(this.acc.phone || "").trim();
        const video = await getNextVideoToPost(phone).catch(() => null);

        if (video) {
            this.logger.info("VIDEO_POST_START", { ...ctx, videoId: video.id, source: video.source_url });

            await doMission("CreateVideoPost", async () => {
                const videoPath = video.local_path;
                
                if (!fs.existsSync(videoPath)) {
                    throw new Error(`Video file not found: ${videoPath}`);
                }

                const fileSizeBytes = fs.statSync(videoPath).size;
                const MAX_SIZE = 5 * 1024 * 1024;

                if (fileSizeBytes > MAX_SIZE) {
                    this.logger.warn("VIDEO_TOO_LARGE_SKIPPING", { ...ctx, sizeMB: (fileSizeBytes / (1024 * 1024)).toFixed(2) });
                    await markVideoPosted(video.id, phone).catch(() => {});
                    throw new Error(`Video too large: ${(fileSizeBytes / 1024 / 1024).toFixed(2)}MB`);
                }

                const form = new FormData();
                form.append('file', fs.createReadStream(videoPath), {
                    filename: path.basename(videoPath),
                    contentType: 'video/mp4',
                });

                const uploadRes = await MediaApiService.uploadMedia(accessToken, form as any, h, this.proxyAgent);
                const mediaId = uploadRes?.data?.data?.id || uploadRes?.data?.id || '';

                if (!mediaId) throw new Error('Upload failed, no mediaId');

                const postPayload = {
                    content: video.caption || getRandomStatus(),
                    mediaType: "VIDEO",
                    mediaIds: JSON.stringify([mediaId]),
                    hashtags: video.hashtags || '[]',
                    mentions: "[]",
                    type: "POST",
                    privacy: "PUBLIC",
                    checkinLocation: null,
                    tags: "[]",
                    backgroundColor: null
                };

                const postRes = await FeedApiService.createPost(accessToken, postPayload, h, this.proxyAgent);

                const posted = await markVideoPosted(video.id, phone).catch(() => null);
                if (posted?.fullyPosted && posted.localPath) {
                    if (fs.existsSync(posted.localPath)) {
                        try {
                            fs.unlinkSync(posted.localPath);
                            this.logger.info("SOURCE_VIDEO_DELETED_AFTER_MAX_POSTS", { videoId: video.id });
                        } catch (e) {}
                    }
                }

                return postRes;
            }, ctx);
        } else {
            this.logger.info("NO_VIDEO_AVAILABLE_FALLBACK_TEXT", ctx);
            const t = getRandomStatus();
            const postPayload = {
                content: t, mediaType: "TEXT", hashtags: "[]", mentions: "[]",
                type: "POST", privacy: "PUBLIC", checkinLocation: null, tags: "[]", backgroundColor: null
            };
            await doMission("CreatePost", () => FeedApiService.createPost(accessToken, postPayload, h, this.proxyAgent), ctx);
        }
    }
}
