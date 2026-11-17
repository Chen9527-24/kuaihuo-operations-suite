export interface ApiEnvelope<T> {
  code?: number;
  message?: string;
  data?: T;
  result?: T;
  accessToken?: string;
  refreshToken?: string;
  [key: string]: unknown;
}

export interface ApiErrorPayload {
  code?: number;
  message?: string;
  status?: number;
}
