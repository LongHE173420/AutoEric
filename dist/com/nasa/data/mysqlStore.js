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
exports.releaseVideoReservation = releaseVideoReservation;
exports.getAccountsFromDb = getAccountsFromDb;
exports.getAppDataAccountsFromDb = getAppDataAccountsFromDb;
exports.saveAppUserId = saveAppUserId;
exports.getUsersForFriendRequest = getUsersForFriendRequest;
exports.recordFriendRequest = recordFriendRequest;
exports.saveTokensToDb = saveTokensToDb;
exports.recordRunInDb = recordRunInDb;
exports.getNextVideoToPost = getNextVideoToPost;
exports.markVideoPosted = markVideoPosted;
exports.deleteVideoFromQueue = deleteVideoFromQueue;
exports.cleanupFullyPostedVideos = cleanupFullyPostedVideos;
exports.updateFriendRequestStatus = updateFriendRequestStatus;
const promise_1 = __importDefault(require("mysql2/promise"));
const env_1 = require("../config/env");
function getLocalDateString() {
    const d = new Date();
    // Offset standard UTC minutes and add +7 hours for Vietnam
    const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    const vnTime = new Date(utc + (3600000 * 7));
    return `${vnTime.getFullYear()}-${String(vnTime.getMonth() + 1).padStart(2, '0')}-${String(vnTime.getDate()).padStart(2, '0')}`;
}
async function getConnection() {
    return await promise_1.default.createConnection({
        host: env_1.ENV.DB_HOST,
        user: env_1.ENV.DB_USER,
        password: env_1.ENV.DB_PASS,
        database: env_1.ENV.DB_NAME
    });
}
const reservedVideoLocks = new Map();
function getVideoLockName(videoId) {
    return `autoe:video:${videoId}`;
}
async function acquireVideoReservation(videoId) {
    const existing = reservedVideoLocks.get(videoId);
    if (existing)
        return false;
    const conn = await getConnection();
    try {
        const [rows] = await conn.execute(`SELECT GET_LOCK(?, 0) AS acquired`, [getVideoLockName(videoId)]);
        const acquired = Number(rows?.[0]?.acquired || 0) === 1;
        if (!acquired) {
            await conn.end();
            return false;
        }
        reservedVideoLocks.set(videoId, conn);
        return true;
    }
    catch (err) {
        try {
            await conn.end();
        }
        catch { }
        return false;
    }
}
async function releaseVideoReservation(videoId) {
    if (typeof videoId !== "number" || !Number.isFinite(videoId)) {
        return;
    }
    const conn = reservedVideoLocks.get(videoId);
    if (!conn) {
        return;
    }
    reservedVideoLocks.delete(videoId);
    try {
        await conn.execute(`SELECT RELEASE_LOCK(?)`, [getVideoLockName(videoId)]);
    }
    catch {
        // ignore release errors
    }
    finally {
        try {
            await conn.end();
        }
        catch { }
    }
}
async function getAccountsFromDb() {
    const connection = await getConnection();
    try {
        const today = getLocalDateString();
        const [rows] = await connection.execute(`
            SELECT phone, password, deviceId, userAgent, accessToken, refreshToken 
            FROM users 
            WHERE daily_run_count < 2 
               OR last_run_date < ? 
               OR last_run_date IS NULL
        `, [today]);
        return rows;
    }
    finally {
        await connection.end();
    }
}
async function getAppDataAccountsFromDb() {
    const connection = await getConnection();
    try {
        const [rows] = await connection.execute(`
            SELECT id, phone, deviceId, userAgent, app_user_id, daily_run_count, last_run_date, accessToken, refreshToken
            FROM users
            ORDER BY id ASC
        `);
        return rows;
    }
    finally {
        await connection.end();
    }
}
async function saveAppUserId(phone, appUserId) {
    const connection = await getConnection();
    try {
        await connection.execute("UPDATE users SET app_user_id = ? WHERE phone = ?", [appUserId, phone]);
    }
    catch (e) {
        console.error("Failed to save app_user_id for", phone, e.message);
    }
    finally {
        await connection.end();
    }
}
async function getUsersForFriendRequest(currentPhone, limit) {
    const connection = await getConnection();
    try {
        const [rows] = await connection.execute(`
            SELECT phone, app_user_id 
            FROM users 
            WHERE app_user_id IS NOT NULL 
              AND phone != ?
              AND phone NOT IN (
                  SELECT receiver_phone FROM friend WHERE sender_phone = ?
                  UNION
                  SELECT sender_phone FROM friend WHERE receiver_phone = ?
              )
            ORDER BY id ASC
            LIMIT ${Number(limit)}
        `, [currentPhone, currentPhone, currentPhone]);
        return rows;
    }
    finally {
        await connection.end();
    }
}
async function recordFriendRequest(senderPhone, receiverPhone, receiverId) {
    const connection = await getConnection();
    try {
        await connection.execute(`
            INSERT IGNORE INTO friend (sender_phone, receiver_phone, receiver_id, status)
            VALUES (?, ?, ?, 'PENDING')
        `, [senderPhone, receiverPhone, receiverId]);
    }
    catch (e) {
        console.error("Failed to record friend request", senderPhone, "->", receiverPhone, e.message);
    }
    finally {
        await connection.end();
    }
}
async function saveTokensToDb(phone, accessToken, refreshToken) {
    const connection = await getConnection();
    try {
        await connection.execute("UPDATE users SET accessToken = ?, refreshToken = ? WHERE phone = ?", [accessToken, refreshToken, phone]);
    }
    finally {
        await connection.end();
    }
}
async function recordRunInDb(phone) {
    const connection = await getConnection();
    try {
        const today = getLocalDateString();
        await connection.execute(`
            UPDATE users 
            SET 
                daily_run_count = IF(last_run_date = ?, daily_run_count + 1, 1),
                last_run_date = ?
            WHERE phone = ?
        `, [today, today, phone]);
    }
    catch (e) {
        console.error("Failed to update daily_run_count for", phone, e);
    }
    finally {
        await connection.end();
    }
}
async function getNextVideoToPost(accountPhone) {
    const conn = await getConnection();
    try {
        const [rows] = await conn.execute(`SELECT v.id, v.source_url, v.video_url, v.local_path, v.caption, v.hashtags
             FROM crawled_videos v
             WHERE v.downloaded = 1
               AND v.local_path IS NOT NULL
               AND v.post_count < v.max_posts
               AND NOT EXISTS (
                 SELECT 1 FROM video_post_log l
                 WHERE l.video_id = v.id AND l.account_phone = ?
               )
             ORDER BY v.created_at ASC
             LIMIT 20`, [accountPhone]);
        if (!rows || rows.length === 0)
            return null;
        for (const row of rows) {
            const videoId = Number(row?.id);
            if (!Number.isFinite(videoId)) {
                continue;
            }
            const acquired = await acquireVideoReservation(videoId);
            if (acquired) {
                return row;
            }
        }
        return null;
    }
    finally {
        await conn.end();
    }
}
async function markVideoPosted(videoId, accountPhone) {
    const conn = await getConnection();
    try {
        const [insertRes] = await conn.execute(`INSERT IGNORE INTO video_post_log (video_id, account_phone) VALUES (?, ?)`, [videoId, accountPhone]);
        const inserted = Number(insertRes?.affectedRows || 0) > 0;
        if (inserted) {
            await conn.execute(`UPDATE crawled_videos SET post_count = post_count + 1 WHERE id = ?`, [videoId]);
        }
        // Kiểm tra đã đăng đủ số lần chưa
        const [rows] = await conn.execute(`SELECT local_path, post_count, max_posts FROM crawled_videos WHERE id = ?`, [videoId]);
        const row = rows?.[0];
        const fullyPosted = row ? row.post_count >= row.max_posts : false;
        if (fullyPosted && row?.local_path) {
            // Xóa local_path trong DB để đánh dấu đã dọn
            await conn.execute(`UPDATE crawled_videos SET local_path = NULL, downloaded = 0 WHERE id = ?`, [videoId]);
        }
        return { localPath: row?.local_path ?? null, fullyPosted };
    }
    finally {
        await releaseVideoReservation(videoId);
        await conn.end();
    }
}
/** Dọn dẹp file local của các video đã đăng đủ số lần (safety net) */
async function deleteVideoFromQueue(videoId) {
    const conn = await getConnection();
    try {
        await conn.execute(`UPDATE crawled_videos
             SET local_path = NULL, downloaded = 0
             WHERE id = ?`, [videoId]);
    }
    finally {
        await releaseVideoReservation(videoId);
        await conn.end();
    }
}
async function cleanupFullyPostedVideos() {
    const conn = await getConnection();
    try {
        const [rows] = await conn.execute(`SELECT id, local_path FROM crawled_videos
             WHERE post_count >= max_posts AND local_path IS NOT NULL AND downloaded = 1`);
        let cleaned = 0;
        for (const row of rows) {
            try {
                const fs = await Promise.resolve().then(() => __importStar(require('fs')));
                if (fs.existsSync(row.local_path)) {
                    fs.unlinkSync(row.local_path);
                    cleaned++;
                }
            }
            catch (e) {
                console.warn(`[CLEANUP] Cannot delete ${row.local_path}: ${e.message}`);
            }
            await conn.execute(`UPDATE crawled_videos SET local_path = NULL, downloaded = 0 WHERE id = ?`, [row.id]);
        }
        return cleaned;
    }
    finally {
        await conn.end();
    }
}
async function updateFriendRequestStatus(senderId, receiverPhone, status) {
    const connection = await getConnection();
    try {
        await connection.execute(`
            UPDATE friend f
            INNER JOIN users u ON u.phone = f.sender_phone
            SET f.status = ?
            WHERE f.receiver_phone = ? AND u.app_user_id = ?
        `, [status, receiverPhone, senderId]);
    }
    catch (error) {
        console.error("Error updating friend request status:", error);
    }
}
