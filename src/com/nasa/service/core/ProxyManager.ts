import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

export class ProxyManager {
    private proxies: string[] = [];
    private failedProxies: Set<string> = new Set();
    private workingProxies: Set<string> = new Set();
    private currentIndex = 0;
    private currentProxyUsage = 0;
    private readonly MAX_PER_PROXY = 5;

    constructor() {
        this.loadProxies();
    }

    private loadProxies() {
        try {
            const p = path.resolve(process.cwd(), 'data', 'proxies.txt');
            if (fs.existsSync(p)) {
                const lines = fs.readFileSync(p, 'utf-8').split('\n');
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed.startsWith('IP Address')) continue;

                    const parts = trimmed.split(/\s+/);
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

    public async getWorkingProxy(): Promise<string | null> {
        if (this.proxies.length === 0) return null;

        // Try to reuse the current proxy if it hasn't exceeded 5 uses
        const proxyIdx = this.currentIndex % this.proxies.length;
        const currentProxy = this.proxies[proxyIdx];

        if (this.currentProxyUsage < this.MAX_PER_PROXY && !this.failedProxies.has(currentProxy)) {
            this.currentProxyUsage++;
            return currentProxy;
        }

        // Reset usage for the next proxy
        this.currentProxyUsage = 0;

        // Find the next working proxy starting from the next index
        const startIdx = (this.currentIndex + 1) % this.proxies.length;
        for (let i = 0; i < this.proxies.length; i++) {
            const idx = (startIdx + i) % this.proxies.length;
            const proxy = this.proxies[idx];

            if (this.failedProxies.has(proxy)) continue;

            this.currentIndex = idx;
            console.log(`[ProxyManager] Testing proxy connectivity: ${proxy} (Rotate)...`);
            const isWorking = await this.testProxy(proxy);
            if (isWorking) {
                console.log(`[ProxyManager] ✅ Proxy ${proxy} is working!`);
                this.workingProxies.add(proxy);
                this.currentProxyUsage = 1;
                return proxy;
            } else {
                console.log(`[ProxyManager] ❌ Proxy ${proxy} failed.`);
                this.failedProxies.add(proxy);
            }
        }

        console.log(`[ProxyManager] Exhausted all loaded proxies.`);
        return null;
    }

    private async testProxy(proxyUrl: string): Promise<boolean> {
        try {
            const agent = new HttpsProxyAgent(proxyUrl);
            await axios.get('https://social.eric.pro.vn/api/user/me', {
                httpsAgent: agent,
                timeout: 5000,
                validateStatus: () => true // Reject only on network errors, not HTTP status
            });
            return true;
        } catch (e) {
            return false;
        }
    }
}
