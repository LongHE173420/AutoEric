import axios, { AxiosInstance } from "axios";
import { ENV } from "../config/env";

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

export type LoginRes = { needOtp: boolean; otpSample?: string; tokens?: Tokens };
export type VerifyOtpRes = { tokens: Tokens };
export type RefreshRes = { tokens: Tokens };

export class AuthServiceApi {
  private http: AxiosInstance;

  constructor(baseURL = ENV.BASE_URL) {
    this.http = axios.create({
      baseURL,
      timeout: 20_000,
      headers: { "Content-Type": "application/json" },
    });
  }

  async login(username: string, password: string, deviceId: string) {
    return this.http.post<ApiRes<LoginRes>>(
      "/auth/login",
      { phone: username, password },
      { headers: { "x-device-id": deviceId } }
    );
  }

  async verifyLoginOtp(username: string, otp: string, deviceId: string) {
    return this.http.post<ApiRes<VerifyOtpRes>>(
      "/auth/verify-login-otp",
      { phone: username, otp },
      { headers: { "x-device-id": deviceId } }
    );
  }

  async resendLoginOtp(username: string, deviceId: string) {
    return this.http.post<ApiRes<any>>(
      "/auth/resend-otp-login",
      { phone: username },
      { headers: { "x-device-id": deviceId } }
    );
  }

  async refreshToken(refreshToken: string) {
    return this.http.post<ApiRes<RefreshRes>>("/auth/refresh-token", { refreshToken });
  }

  async getMe(accessToken: string) {
    return this.http.get<ApiRes<any>>("/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  // Requires AuthService DEBUG_OTP=true
  async debugRedisOtp(phone: string, context: string = "LOGIN") {
    return this.http.get<ApiRes<any>>(ENV.OTP_DEBUG_PATH_REDIS, {
      params: { phone, context },
    });
  }
}
