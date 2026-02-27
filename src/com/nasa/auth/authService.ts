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
export type VerifyOtpRes = { tokens?: Tokens; accessToken?: string; refreshToken?: string };
export type RefreshRes = { tokens?: Tokens; accessToken?: string; refreshToken?: string };

export class AuthServiceApi {
  private http: AxiosInstance;

  constructor(baseURL = ENV.KONG_URL) {
    this.http = axios.create({
      baseURL,
      timeout: 20_000,
      headers: { "Content-Type": "application/json" },
    });
  }

  // --- LOGIN ---
  async login(phone: string, password: string, headers: any) {
    return this.http.post<ApiRes<LoginRes>>("/api/auth/login", { phone, password }, { headers });
  }

  async verifyLoginOtp(phone: string, otp: string, headers: any) {
    return this.http.post<ApiRes<VerifyOtpRes>>("/api/auth/verify-login-otp", { phone, otp }, { headers });
  }

  async resendLoginOtp(phone: string, headers: any) {
    return this.http.post<ApiRes<any>>("/api/auth/resend-otp-login", { phone }, { headers });
  }

  // --- REGISTER ---
  async validateUsername(username: string, headers?: any) {
    return this.http.post<ApiRes<any>>("/api/auth/validate-username", { username }, { headers });
  }

  async register(data: any, headers?: any) {
    return this.http.post<ApiRes<any>>("/api/auth/register", data, { headers });
  }

  async verifyRegisterOtp(phone: string, otp: string, headers?: any) {
    return this.http.post<ApiRes<any>>("/api/auth/verify-register-otp", { phone, otp }, { headers });
  }

  async resendRegisterOtp(phone: string, headers?: any) {
    return this.http.post<ApiRes<any>>("/api/auth/resend-otp-register", { phone }, { headers });
  }

  // --- PASSWORD ---
  async forgotPassword(phone: string, headers?: any) {
    return this.http.post<ApiRes<any>>("/api/password/forgot", { phone }, { headers });
  }

  async verifyForgotOtp(phone: string, otp: string, headers?: any) {
    return this.http.post<ApiRes<any>>("/api/password/verify-otp", { phone, otp }, { headers });
  }

  async resetPassword(data: any, headers?: any) {
    return this.http.post<ApiRes<any>>("/api/password/reset", data, { headers });
  }

  async resendForgotOtp(phone: string, headers?: any) {
    return this.http.post<ApiRes<any>>("/api/password/resend-otp-forgot", { phone }, { headers });
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
    return this.http.post<ApiRes<any>>("/api/auth/logout", { refreshToken }, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  async saveTrustedDevice(accessToken: string, deviceId: string) {
    return this.http.post<ApiRes<any>>("/api/trusted-device/save", { deviceId }, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }


  async debugRedisOtp(phone: string, context: string = "LOGIN", headers?: any) {
    return this.http.get<ApiRes<any>>(ENV.OTP_DEBUG_PATH_REDIS, {
      params: { phone, context },
      headers,
    });
  }
}

