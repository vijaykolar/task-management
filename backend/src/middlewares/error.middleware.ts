import type { ErrorRequestHandler, RequestHandler } from "express";
import mongoose from "mongoose";
import { ApiError } from "../utils/api-error.js";

interface MongoDuplicateKeyError {
  code: 11000;
  keyPattern?: Record<string, unknown>;
}

interface BodyParserError {
  type: string;
  status?: number;
}

// Keyed by the sorted, comma-joined fields of the unique index
const duplicateKeyMessages: Record<string, string> = {
  email: "An account with this email already exists",
  username: "This username is already taken",
  "createdBy,name": "You already have a project with this name",
  "project,user": "This user is already a member of the project",
};

const isDuplicateKeyError = (err: unknown): err is MongoDuplicateKeyError =>
  typeof err === "object" &&
  err !== null &&
  (err as { code?: unknown }).code === 11000;

const isBodyParserError = (err: unknown): err is BodyParserError =>
  typeof err === "object" &&
  err !== null &&
  typeof (err as { type?: unknown }).type === "string" &&
  "status" in err;

/** Converts anything thrown in a route into an ApiError with a safe message */
const toApiError = (err: unknown): ApiError => {
  if (err instanceof ApiError) {
    const valid = err.statusCode >= 400 && err.statusCode <= 599;
    return valid ? err : new ApiError(500, err.message, err.errors);
  }

  if (err instanceof mongoose.Error.CastError) {
    return new ApiError(400, `Invalid ${err.path}`);
  }

  if (err instanceof mongoose.Error.ValidationError) {
    return new ApiError(
      422,
      "Received data is not valid",
      Object.values(err.errors).map((e) => ({ [e.path]: e.message })),
    );
  }

  if (isDuplicateKeyError(err)) {
    const fields = Object.keys(err.keyPattern ?? {})
      .sort()
      .join(",");
    return new ApiError(
      409,
      duplicateKeyMessages[fields] ?? "This record already exists",
    );
  }

  if (isBodyParserError(err)) {
    if (err.type === "entity.parse.failed") {
      return new ApiError(400, "Request body is not valid JSON");
    }
    if (err.type === "entity.too.large") {
      return new ApiError(413, "Request body is too large");
    }
  }

  // Thrown by `new ObjectId(value)` for malformed ids
  if (err instanceof Error && err.name === "BSONError") {
    return new ApiError(400, "Invalid id");
  }

  return new ApiError(500, "Something went wrong on our end");
};

/** Unknown /api routes answer with JSON instead of Express's HTML 404 */
export const notFoundHandler: RequestHandler = (req, res, next) => {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
};

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  const apiError = toApiError(err);
  const isServerError = apiError.statusCode >= 500;

  if (isServerError) {
    console.error(`[${req.method} ${req.originalUrl}]`, err);
  }

  res.status(apiError.statusCode).json({
    statusCode: apiError.statusCode,
    data: null,
    message: apiError.message,
    success: false,
    errors: apiError.errors,
    // Stack traces help locally but must never reach production clients
    ...(isServerError &&
      process.env.NODE_ENV !== "production" &&
      err instanceof Error && { stack: err.stack }),
  });
};
