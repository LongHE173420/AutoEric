import axios, { AxiosInstance } from "axios";
import { ENV } from "../../config/env";
import { applyStandardInterceptors } from "../../utils/axiosSignature";
import { buildHeaders } from "../../utils/headers";

export type ApiRes<T> = {
  isSucceed: boolean;
  message: string;
  data?: T;
};

export type Tokens = {
  accessToken: string;
  refreshToken: string;
  accessExp?: number;
  refreshExp?: number;
  trust?: boolean;
};

export type LoginRes = {
  needOtp?: boolean;
  otpRequired?: boolean;
  otpSample?: string;
  otpDeliveryMessage?: string | null;
  otpDestination?: string | null;
  accessToken?: string;
  refreshToken?: string;
  tokens?: Tokens;
};

export type VerifyOtpRes = {
  tokens?: Tokens;
  accessToken?: string;
  refreshToken?: string;
};

export type RefreshRes = {
  tokens?: Tokens;
  accessToken?: string;
  refreshToken?: string;
};

export class AuthServiceApi {
  private http: AxiosInstance;

  constructor(deviceId: string, baseURL = ENV.KONG_URL, proxyAgent?: any) {
    const config: any = {
      baseURL,
      timeout: 20_000,
    };

    if (proxyAgent) {
      config.httpsAgent = proxyAgent;
    }

    this.http = axios.create(config);

    applyStandardInterceptors(this.http, deviceId);
  }

  // --- LOGIN ---
  async login(phone: string, password: string, headers: any) {
    return this.http.post<ApiRes<LoginRes>>("/api/auth/login", { username: phone, password }, { headers });
  }

  async verifyLoginOtp(phone: string, otp: string, headers: any) {
    return this.http.post<ApiRes<VerifyOtpRes>>("/api/auth/verify-login-otp", { username: phone, otp, channel: "EMAIL" }, { headers });
  }

  async resendLoginOtp(phone: string, headers: any) {
    return this.http.post<ApiRes<any>>("/api/auth/resend-otp-login", { username: phone, channel: "EMAIL" }, { headers });
  }

  // --- PASSWORD ---
  async forgotPassword(phone: string, headers?: any) {
    return this.http.post<ApiRes<any>>("/api/password/forgot", { username: phone }, { headers });
  }

  async verifyForgotOtp(phone: string, otp: string, headers?: any) {
    return this.http.post<ApiRes<any>>("/api/password/verify-otp", { username: phone, otp }, { headers });
  }

  async resetPassword(data: any, headers?: any) {
    return this.http.post<ApiRes<any>>("/api/password/reset", data, { headers });
  }

  async resendForgotOtp(phone: string, headers?: any) {
    return this.http.post<ApiRes<any>>("/api/password/resend-otp-forgot", { username: phone }, { headers });
  }

  async changePassword(accessToken: string, data: any) {
    return this.http.post<ApiRes<any>>("/api/v1/auth/change-password", data, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  // --- SESSION & OTHERS ---
  async refreshToken(refreshToken: string, headers: any) {
    return this.http.post<ApiRes<RefreshRes>>("/api/auth/refresh", { refreshToken }, { headers });
  }

  async logout(accessToken: string, refreshToken: string) {
    return this.http.post<ApiRes<any>>(
      "/api/auth/logout",
      { refreshToken },
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
  }

  async saveTrustedDevice(accessToken: string, deviceId: string) {
    return this.http.post<ApiRes<any>>(
      "/api/trusted-device/save",
      { deviceId },
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
  }

  // --- MFA ---
  async setupMfa(accessToken: string) {
    return this.http.post<ApiRes<any>>(
      "/api/v1/mfa/setup",
      {},
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
  }

  async confirmMfa(accessToken: string, otp: string) {
    return this.http.post<ApiRes<any>>(
      "/api/v1/mfa/confirm-setup",
      { otp },
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
  }

  async disableMfa(accessToken: string, otp: string) {
    return this.http.post<ApiRes<any>>(
      "/api/v1/mfa/disable",
      { otp },
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
  }

  async debugRedisOtp(phone: string, context: string = "LOGIN", headers?: any) {
    if (ENV.UPSTASH_REDIS_REST_URL && ENV.UPSTASH_REDIS_REST_TOKEN) {
      const baseUrl = ENV.UPSTASH_REDIS_REST_URL.replace(/\/$/, "");
      const key = `otp:${context.toLowerCase()}:${phone}`;
      const redisUrl = `${baseUrl}/get/${key}`;

      const res = await axios.get(redisUrl, {
        headers: {
          Authorization: `Bearer ${ENV.UPSTASH_REDIS_REST_TOKEN}`
        }
      });
      if (res.data?.result) {
        return { data: { data: { otp: res.data.result, timestamp: Date.now() } } } as any;
      }
      return { data: { data: null } } as any;
    }

    return this.http.get<ApiRes<any>>(ENV.OTP_DEBUG_PATH_REDIS, {
      params: { username: phone, context },
      headers,
    });
  }
}