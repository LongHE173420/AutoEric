"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProxyHelper = void 0;
const https_proxy_agent_1 = require("https-proxy-agent");
const env_1 = require("../config/env");
class ProxyHelper {
    constructor(acc, proxyManager, logger) {
        this.acc = acc;
        this.proxyManager = proxyManager;
        this.logger = logger;
        try {
            if (this.acc.proxy) {
                this.proxyAgent = new https_proxy_agent_1.HttpsProxyAgent(this.acc.proxy);
            }
        }
        catch (e) {
            this.logger?.error("PROXY_INIT_ERROR", { err: e.message });
        }
    }
    async attachInitialProxy(ctx) {
        try {
            if (!this.proxyManager || this.acc.proxy)
                return;
            const proxy = await this.waitForWorkingProxy(ctx, "startup");
            if (!proxy) {
                if (env_1.ENV.PROXY_REQUIRED) {
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
            this.proxyAgent = new https_proxy_agent_1.HttpsProxyAgent(proxy);
            this.logger?.info("PROXY_ATTACHED", { ...ctx, proxy });
        }
        catch (e) {
            if (env_1.ENV.PROXY_REQUIRED && e?.message === "PROXY_REQUIRED_NO_WORKING_PROXY") {
                throw e;
            }
            this.logger?.warn("PROXY_STARTUP_SKIPPED", {
                ...ctx,
                reason: e?.message || "Proxy startup failed, continue without proxy"
            });
        }
    }
    async switchProxy(ctx) {
        try {
            if (!this.proxyManager)
                return false;
            if (this.acc.proxy) {
                this.proxyManager.markFailed(this.acc.proxy);
            }
            const previousProxy = this.acc.proxy;
            const newProxy = await this.waitForWorkingProxy(ctx, "replacement");
            if (!newProxy) {
                if (env_1.ENV.PROXY_REQUIRED) {
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
            this.proxyAgent = new https_proxy_agent_1.HttpsProxyAgent(newProxy);
            this.logger?.info("PROXY_SWITCHED", {
                ...ctx,
                oldProxy: previousProxy,
                newProxy,
                recoveredSameProxy: previousProxy === newProxy
            });
            return true;
        }
        catch (e) {
            this.logger?.error("PROXY_SWITCH_ERROR", { ...ctx, err: e.message });
            return false;
        }
    }
    async waitForWorkingProxy(ctx, phase) {
        try {
            if (!this.proxyManager)
                return null;
            const startedAt = Date.now();
            const hardTimeoutMs = env_1.ENV.PROXY_REQUIRED ? 3 * 60000 : 5000;
            while (Date.now() - startedAt < hardTimeoutMs) {
                const proxy = await this.proxyManager.getWorkingProxy();
                if (proxy) {
                    return proxy;
                }
                const retryDelay = this.proxyManager.getNextRetryDelayMs();
                const waitMs = Math.min(Math.max(retryDelay ?? 2000, 1000), 5000);
                this.logger?.warn("PROXY_WAITING_RETRY", {
                    ...ctx,
                    phase,
                    waitMs
                });
                await new Promise((resolve) => setTimeout(resolve, waitMs));
            }
            return null;
        }
        catch (e) {
            this.logger?.error("PROXY_WAIT_ERROR", { ...ctx, err: e.message });
            return null;
        }
    }
}
exports.ProxyHelper = ProxyHelper;
