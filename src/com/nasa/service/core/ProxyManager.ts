import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

export class ProxyManager {
    private proxies: string[] = [];
    private failedProxies: Set<string> = new Set();
    private workingProxies: Set<string> = new Set();
    private currentIndex = 0;

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

        const proxyIdx = this.currentIndex % this.proxies.length;
        const currentProxy = this.proxies[proxyIdx];

        // Đã xác nhận working từ trước → dùng lại không cần test
        if (!this.failedProxies.has(currentProxy) && this.workingProxies.has(currentProxy)) {
            return currentProxy;
        }

        // Chưa test lần nào → test trước khi dùng
        if (!this.failedProxies.has(currentProxy)) {
            console.log(`[ProxyManager] Testing proxy connectivity: ${currentProxy}...`);
            const isWorking = await this.testProxy(currentProxy);
            if (isWorking) {
                console.log(`[ProxyManager] ✅ Proxy ${currentProxy} is working!`);
                this.workingProxies.add(currentProxy);
                return currentProxy;
            } else {
                console.log(`[ProxyManager] ❌ Proxy ${currentProxy} failed.`);
                this.failedProxies.add(currentProxy);
            }
        }

        // Proxy hiện tại đã fail → tìm proxy tiếp theo
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
                timeout: 10000,
                validateStatus: () => true
            });
            return true;
        } catch (e) {
            return false;
        }
    }

    public markFailed(proxy: string) {
        if (proxy && !this.failedProxies.has(proxy)) {
            console.log(`[ProxyManager] ⚠️ Proxy ${proxy} marked as failed from real usage.`);
            this.failedProxies.add(proxy);
        }
    }
}
