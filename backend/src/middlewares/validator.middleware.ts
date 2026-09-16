import type { NextFunction, Request, Response } from "express";
import { validationResult } from "express-validator";
import { ApiError } from "../utils/api-error.js";
import { getUploadedFiles, removeFiles } from "../utils/attachments.js";

export const validate = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const errors = validationResult(req);
  if (errors.isEmpty()) {
    return next();
  }
  const extractedErrors: Record<string, string>[] = errors
    .array()
    .map((err) => ({
      [err.type === "field" ? err.path : err.type]: err.msg,
    }));

  // Files were already written by multer; drop them since the request is rejected
  void removeFiles(getUploadedFiles(req).map((file) => file.path));

  throw new ApiError(422, "Recieved data is not valid", extractedErrors);
};
