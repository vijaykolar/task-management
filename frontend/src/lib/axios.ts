import axios, {
  AxiosError,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from "axios";

import { env } from "@/config/env";
import type { ApiErrorResponse, ApiResponse } from "@/types/api";

export const api = axios.create({
  baseURL: env.apiBaseUrl,
  // Backend sets accessToken / refreshToken as cookies
  withCredentials: true,
  timeout: 15_000,
});

// ---------- Error normalization ----------

export class ApiClientError extends Error {
  readonly statusCode: number;
  readonly errors: unknown[];

  constructor(message: string, statusCode: number, errors: unknown[] = []) {
    super(message);
    this.name = "ApiClientError";
    this.statusCode = statusCode;
    this.errors = errors;
  }
}

const fallbackMessages: Record<number, string> = {
  400: "The request was not valid",
  401: "Please sign in to continue",
  403: "You don't have permission to do that",
  404: "Not found",
  409: "This conflicts with existing data",
  413: "The upload is too large",
  429: "Too many requests. Please slow down.",
  503: "The service is temporarily unavailable",
};

/** True when the API error carries `{ code }` in its errors array */
export function hasErrorCode(error: unknown, code: string) {
  return (
    error instanceof ApiClientError &&
    error.errors.some(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        (item as { code?: unknown }).code === code,
    )
  );
}

export function toApiClientError(error: unknown): ApiClientError {
  if (error instanceof ApiClientError) return error;

  if (axios.isAxiosError<ApiErrorResponse>(error)) {
    if (!error.response) {
      return new ApiClientError(
        error.code === AxiosError.ECONNABORTED
          ? "Request timed out"
          : "Network error. Please check your connection.",
        0,
      );
    }
    const { status, data } = error.response;
    // Non-JSON bodies (e.g. a proxy's HTML page) have no usable message
    const body = typeof data === "object" && data !== null ? data : undefined;
    return new ApiClientError(
      body?.message ||
        fallbackMessages[status] ||
        (status >= 500
          ? "Something went wrong on our end. Please try again."
          : error.message),
      status,
      Array.isArray(body?.errors) ? body.errors : [],
    );
  }

  return new ApiClientError(
    error instanceof Error ? error.message : "Something went wrong",
    0,
  );
}

// ---------- Unauthorized handling ----------

let onUnauthorized: (() => void) | undefined;

/** Register a callback (e.g. clear user + redirect to /login) for when refresh fails. */
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

// ---------- Refresh-token interceptor ----------

type RetryableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

const AUTH_PATHS_WITHOUT_REFRESH = [
  "/auth/login",
  "/auth/register",
  "/auth/refresh-token",
];

let refreshPromise: Promise<void> | null = null;

function refreshAccessToken() {
  // Share one in-flight refresh between all requests that got a 401
  refreshPromise ??= api
    .post("/auth/refresh-token")
    .then(() => undefined)
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

api.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!axios.isAxiosError(error) || !error.config) {
      return Promise.reject(toApiClientError(error));
    }

    const config = error.config as RetryableConfig;
    const isAuthPath = AUTH_PATHS_WITHOUT_REFRESH.some((path) =>
      config.url?.includes(path),
    );

    if (error.response?.status === 401 && !config._retry && !isAuthPath) {
      config._retry = true;
      try {
        await refreshAccessToken();
        return api(config);
      } catch {
        onUnauthorized?.();
      }
    }

    return Promise.reject(toApiClientError(error));
  },
);

// ---------- Typed helpers (unwrap ApiResponse) ----------

export const http = {
  get: <T>(url: string, config?: AxiosRequestConfig) =>
    api.get<ApiResponse<T>>(url, config).then((res) => res.data),
  post: <T, B = unknown>(url: string, body?: B, config?: AxiosRequestConfig) =>
    api.post<ApiResponse<T>>(url, body, config).then((res) => res.data),
  put: <T, B = unknown>(url: string, body?: B, config?: AxiosRequestConfig) =>
    api.put<ApiResponse<T>>(url, body, config).then((res) => res.data),
  patch: <T, B = unknown>(url: string, body?: B, config?: AxiosRequestConfig) =>
    api.patch<ApiResponse<T>>(url, body, config).then((res) => res.data),
  delete: <T>(url: string, config?: AxiosRequestConfig) =>
    api.delete<ApiResponse<T>>(url, config).then((res) => res.data),
};
