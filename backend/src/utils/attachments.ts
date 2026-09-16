import fs from "fs/promises";
import type { Request } from "express";
import type { ITaskAttachment } from "../models/task.models.js";
import { serverUrl } from "./urls.js";

export const getUploadedFiles = (req: Request<any>): Express.Multer.File[] =>
  Array.isArray(req.files) ? req.files : [];

export const toAttachment = (
  req: Request<any>,
  file: Express.Multer.File,
): ITaskAttachment => {
  return {
    url: `${serverUrl(req)}/images/${file.filename}`,
    name: file.originalname,
    localPath: file.path,
    mimetype: file.mimetype,
    size: file.size,
  };
};

/** Best-effort removal of files from disk; missing files are ignored */
export const removeFiles = async (paths: (string | undefined)[]) => {
  await Promise.all(
    paths
      .filter((p): p is string => !!p)
      .map((p) => fs.unlink(p).catch(() => undefined)),
  );
};
