import { ProxyManager } from "./ProxyManager";
import { HttpsProxyAgent } from "https-proxy-agent";
import { ENV } from "../config/env";
import { Log } from "../utils/log";

type AppLogger = ReturnType<typeof Log.getLogger>;

export class ProxyHelper {
    public proxyAgent?: any;

    constructor(
        private acc: any,
        private proxyManager?: ProxyManager,
        private logger?: AppLogger
    ) {
        try {
            if (this.acc.proxy) {
                this.proxyAgent = new HttpsProxyAgent(this.acc.proxy);
            }
        } catch (e: any) {
            this.logger?.error("PROXY_INIT_ERROR", { err: e.message });
        }
    }

    async attachInitialProxy(ctx: any): Promise<void> {
        try {
            if (!this.proxyManager || this.acc.proxy) return;
            const proxy = await this.waitForWorkingProxy(ctx, "startup");
            if (!proxy) {
                if (ENV.PROXY_REQUIRED) {
                    this.logger?.error("PROXY_REQUIRED_NO_WORKING_PROXY", {
                        ...ctx,
                        reason: "Proxy is required but no working proxy is currently available"
                    });
                    throw new Error("PROXY_REQUIRED_NO_WORKING_PROXY");
                }
                this.logger?.warn("PROXY_STARTUP_SKIPPED", {
                    ...ctx,
                    reason: "No working proxy found quickly, continue without proxy"
                });
                return;
            }
            this.acc.proxy = proxy;
            this.proxyAgent = new HttpsProxyAgent(proxy);
            this.logger?.info("PROXY_ATTACHED", { ...ctx, proxy });
        } catch (e: any) {
            if (ENV.PROXY_REQUIRED && e?.message === "PROXY_REQUIRED_NO_WORKING_PROXY") {
                throw e;
            }
            this.logger?.warn("PROXY_STARTUP_SKIPPED", {
                ...ctx,
                reason: e?.message || "Proxy startup failed, continue without proxy"
            });
        }
    }

    async switchProxy(ctx: any): Promise<boolean> {
        try {
            if (!this.proxyManager) return false;
            if (this.acc.proxy) {
                this.proxyManager.markFailed(this.acc.proxy);
            }
            const previousProxy = this.acc.proxy;
            const newProxy = await this.waitForWorkingProxy(ctx, "replacement");
            if (!newProxy) {
                if (ENV.PROXY_REQUIRED) {
                    this.logger?.error("PROXY_REQUIRED_NO_REPLACEMENT", {
                        ...ctx,
                        reason: "Proxy is required but no replacement proxy is currently available"
                    });
                    return false;
                }
                this.acc.proxy = undefined;
                this.proxyAgent = undefined;
                this.logger?.warn("PROXY_DISABLED_FALLBACK", {
                    ...ctx,
                    reason: "No replacement proxy available, fallback to direct connection"
                });
                return true;
            }
            this.acc.proxy = newProxy;
            this.proxyAgent = new HttpsProxyAgent(newProxy);
            this.logger?.info("PROXY_SWITCHED", {
                ...ctx,
                oldProxy: previousProxy,
                newProxy,
                recoveredSameProxy: previousProxy === newProxy
            });
            return true;
        } catch (e: any) {
            this.logger?.error("PROXY_SWITCH_ERROR", { ...ctx, err: e.message });
            return false;
        }
    }

    private async waitForWorkingProxy(ctx: any, phase: "startup" | "replacement"): Promise<string | null> {
        try {
            if (!this.proxyManager) return null;

            const startedAt = Date.now();
            const hardTimeoutMs = ENV.PROXY_REQUIRED ? 3 * 60_000 : 5_000;

            while (Date.now() - startedAt < hardTimeoutMs) {
                const proxy = await this.proxyManager.getWorkingProxy();
                if (proxy) {
                    return proxy;
                }

                const retryDelay = this.proxyManager.getNextRetryDelayMs();
                const waitMs = Math.min(Math.max(retryDelay ?? 2_000, 1_000), 5_000);
                this.logger?.warn("PROXY_WAITING_RETRY", {
                    ...ctx,
                    phase,
                    waitMs
                });
                await new Promise((resolve) => setTimeout(resolve, waitMs));
            }

            return null;
        } catch (e: any) {
            this.logger?.error("PROXY_WAIT_ERROR", { ...ctx, err: e.message });
            return null;
        }
    }
}
