import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

export class ProxyManager {
    private proxies: string[] = [];
    private failedProxies: Set<string> = new Set();
    private workingProxies: Set<string> = new Set();
    private testingProxies: Map<string, Promise<boolean>> = new Map();
    private currentIndex = 0;
    private readonly testTimeoutMs = 5000;
    private readonly maxChecksPerAttempt = 5;

    constructor() {
        try {
            this.loadProxies();
        } catch (e) {
            console.error("[ProxyManager] Constructor error", e);
        }
    }

    private loadProxies() {
        try {
            const p = path.resolve(process.cwd(), 'data', 'proxies.txt');
            if (fs.existsSync(p)) {
                const lines = fs.readFileSync(p, 'utf-8').split('\n');
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed.startsWith('IP Address')) continue;

                    const parts = trimmed.split(/[:\s]+/);
                    if (parts.length >= 2) {
                        const ip = parts[0];
                        const port = parts[1];
                        if (/^\d+\.\d+\.\d+\.\d+$/.test(ip) && /^\d+$/.test(port)) {
                            this.proxies.push(`http://${ip}:${port}`);
                        }
                    }
                }
                console.log(`[ProxyManager] Loaded ${this.proxies.length} proxies from data/proxies.txt`);
            } else {
                console.warn(`[ProxyManager] File data/proxies.txt not found!`);
            }
        } catch (e) {
            console.error("[ProxyManager] Failed to load proxies", e);
        }
    }

    public async getWorkingProxy(validator?: (proxyUrl: string) => Promise<boolean>): Promise<string | null> {
        try {
            if (this.proxies.length === 0) return null;

            const proxyIdx = this.currentIndex % this.proxies.length;
            const currentProxy = this.proxies[proxyIdx];

            if (!this.failedProxies.has(currentProxy) && this.workingProxies.has(currentProxy)) {
                return currentProxy;
            }

            if (!this.failedProxies.has(currentProxy)) {
                const isWorking = await this.runProxyCheck(currentProxy, validator, false);
                if (isWorking) {
                    console.log(`[ProxyManager] ✅ Proxy ${currentProxy} is working!`);
                    this.workingProxies.add(currentProxy);
                    return currentProxy;
                }

                console.log(`[ProxyManager] ❌ Proxy ${currentProxy} failed.`);
                this.markFailed(currentProxy);
            }

            const startIdx = (this.currentIndex + 1) % this.proxies.length;
            let checked = 0;

            for (let i = 0; i < this.proxies.length; i++) {
                if (checked >= this.maxChecksPerAttempt) {
                    console.log(`[ProxyManager] Reached proxy check limit (${this.maxChecksPerAttempt}) for this attempt.`);
                    break;
                }

                const idx = (startIdx + i) % this.proxies.length;
                const proxy = this.proxies[idx];

                if (this.failedProxies.has(proxy)) continue;

                checked++;
                this.currentIndex = idx;
                const isWorking = await this.runProxyCheck(proxy, validator, true);
                if (isWorking) {
                    console.log(`[ProxyManager] ✅ Proxy ${proxy} is working!`);
                    this.workingProxies.add(proxy);
                    return proxy;
                }

                console.log(`[ProxyManager] ❌ Proxy ${proxy} failed.`);
                this.markFailed(proxy);
            }

            console.log(`[ProxyManager] Exhausted all loaded proxies.`);
            return null;
        } catch (e) {
            console.error("[ProxyManager] getWorkingProxy error", e);
            return null;
        }
    }

    private async testProxy(proxyUrl: string): Promise<boolean> {
        try {
            const agent = new HttpsProxyAgent(proxyUrl);
            const res = await axios.get('https://social.eric.pro.vn/', {
                httpsAgent: agent,
                timeout: this.testTimeoutMs,
                validateStatus: () => true
            });
            return res.status >= 200 && res.status < 500;
        } catch {
            return false;
        }
    }

    private async runProxyCheck(
        proxyUrl: string,
        validator?: (proxyUrl: string) => Promise<boolean>,
        isRotate = false
    ): Promise<boolean> {
        try {
            const existing = this.testingProxies.get(proxyUrl);
            if (existing) {
                return existing;
            }

            console.log(
                `[ProxyManager] Testing proxy connectivity: ${proxyUrl}${isRotate ? " (Rotate)" : ""}...`
            );

            const checkPromise = (async () => {
                try {
                    const task = validator ? validator(proxyUrl) : this.testProxy(proxyUrl);
                    const timeout = new Promise<boolean>((resolve) => 
                        setTimeout(() => resolve(false), this.testTimeoutMs)
                    );
                    return await Promise.race([task, timeout]);
                } catch {
                    return false;
                } finally {
                    this.testingProxies.delete(proxyUrl);
                }
            })();

            this.testingProxies.set(proxyUrl, checkPromise);
            return checkPromise;
        } catch (e) {
            console.error("[ProxyManager] runProxyCheck error", e);
            return false;
        }
    }

    public markFailed(proxy: string) {
        try {
            if (!proxy || this.failedProxies.has(proxy)) return;
            console.log(`[ProxyManager] ⚠️ Proxy ${proxy} marked as failed from real usage.`);
            this.failedProxies.add(proxy);
            this.workingProxies.delete(proxy);
        } catch (e) {
            console.error("[ProxyManager] markFailed error", e);
        }
    }

    public getNextRetryDelayMs(): number | null {
        try {
            return null;
        } catch (e) {
            return null;
        }
    }
}
