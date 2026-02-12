import axios, { AxiosInstance } from "axios";
import { ENV } from "../../config/env";

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

  constructor(baseURL = ENV.BASE_URL) {
    this.http = axios.create({
      baseURL,
      timeout: 20_000,
      headers: { "Content-Type": "application/json" },
    });
  }

  async login(phone: string, password: string, headers: any) {
    return this.http.post<ApiRes<LoginRes>>(
      "/auth/login",
      { phone, password },
      { headers }
    );
  }

  async verifyLoginOtp(phone: string, otp: string, headers: any) {
    return this.http.post<ApiRes<VerifyOtpRes>>(
      "/auth/verify-login-otp",
      { phone, otp },
      { headers }
    );
  }

  async resendLoginOtp(phone: string, headers: any) {
    return this.http.post<ApiRes<any>>(
      "/auth/resend-otp-login",
      { phone },
      { headers }
    );
  }

  async refreshToken(refreshToken: string, headers: any) {
    return this.http.post<ApiRes<RefreshRes>>("/auth/refresh-token", { refreshToken }, { headers });
  }

  async getMe(accessToken: string) {
    return this.http.get<ApiRes<any>>("/me", {
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
