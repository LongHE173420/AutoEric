export async function sleep(ms: number): Promise<void> {
    const waitMs = Math.max(0, Number(ms) || 0);
    if (!waitMs) {
        return;
    }

    await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
}

export async function runWithConcurrency<T>(
    items: T[],
    concurrency: number,
    worker: (item: T, index: number) => Promise<void>
): Promise<void> {
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
