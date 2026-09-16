// Mirrors backend/src/utils/api-response.ts
export interface ApiResponse<T = unknown> {
  statusCode: number;
  data: T;
  message: string;
  success: boolean;
}

// Mirrors backend/src/utils/api-error.ts (serialized)
export interface ApiErrorResponse {
  statusCode: number;
  data: null;
  message: string;
  success: false;
  errors: unknown[];
}
