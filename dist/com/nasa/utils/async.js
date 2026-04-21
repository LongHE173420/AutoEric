"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sleep = sleep;
exports.runWithConcurrency = runWithConcurrency;
async function sleep(ms) {
    const waitMs = Math.max(0, Number(ms) || 0);
    if (!waitMs) {
        return;
    }
    await new Promise((resolve) => setTimeout(resolve, waitMs));
}
async function runWithConcurrency(items, concurrency, worker) {
    const limit = Math.max(1, Math.floor(Number(concurrency) || 1));
    let cursor = 0;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (true) {
            const index = cursor++;
            if (index >= items.length) {
                return;
            }
            await worker(items[index], index);
        }
    });
    await Promise.all(runners);
}
