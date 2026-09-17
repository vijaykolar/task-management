import crypto from "crypto";
import path from "path";
import type { RequestHandler } from "express";
import multer from "multer";
import { ApiError } from "../utils/api-error.js";

export const ATTACHMENT_DIR = "./public/images";
export const MAX_FILES_PER_UPLOAD = 5;
export const MAX_ATTACHMENTS_PER_TASK = 10;
export const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024; // 5 MB

const ALLOWED_MIME_TYPES =
  /^(image\/(png|jpe?g|gif|webp|svg\+xml)|application\/pdf|text\/(plain|csv|markdown)|application\/(zip|json|msword|vnd\.ms-excel|vnd\.ms-powerpoint|vnd\.openxmlformats-officedocument\.[\w.]+))$/;

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, ATTACHMENT_DIR);
  },
  filename: function (req, file, cb) {
    // Random name: avoids collisions and never trusts the client's file name
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: {
    fileSize: MAX_ATTACHMENT_SIZE,
    files: MAX_FILES_PER_UPLOAD,
  },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new ApiError(400, `File type "${file.mimetype}" is not allowed`));
    }
  },
});

const multerMessages: Partial<Record<multer.ErrorCode, string>> = {
  LIMIT_FILE_SIZE: `Each file must be ${MAX_ATTACHMENT_SIZE / 1024 / 1024} MB or smaller`,
  LIMIT_FILE_COUNT: `You can upload up to ${MAX_FILES_PER_UPLOAD} files at a time`,
  LIMIT_UNEXPECTED_FILE: `Upload files in the "attachments" field (max ${MAX_FILES_PER_UPLOAD})`,
};

/** Parses `attachments` files from multipart requests; no-op for JSON bodies */
export const uploadAttachments: RequestHandler = (req, res, next) => {
  upload.array("attachments", MAX_FILES_PER_UPLOAD)(
    req,
    res,
    (err: unknown) => {
      if (err instanceof multer.MulterError) {
        return next(new ApiError(400, multerMessages[err.code] ?? err.message));
      }
      next(err);
    },
  );
};

// ---------- Avatars ----------

export const MAX_AVATAR_SIZE = 2 * 1024 * 1024; // 2 MB
const AVATAR_MIME_TYPES = /^image\/(png|jpe?g|webp|gif)$/;

const avatarUpload = multer({
  storage,
  limits: { fileSize: MAX_AVATAR_SIZE, files: 1 },
  fileFilter: (req, file, cb) => {
    if (AVATAR_MIME_TYPES.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new ApiError(400, "Avatar must be a PNG, JPEG, WebP or GIF image"));
    }
  },
});

const avatarMessages: Partial<Record<multer.ErrorCode, string>> = {
  LIMIT_FILE_SIZE: `Avatar must be ${MAX_AVATAR_SIZE / 1024 / 1024} MB or smaller`,
  LIMIT_FILE_COUNT: "Upload a single image",
  LIMIT_UNEXPECTED_FILE: 'Upload the image in the "avatar" field',
};

/** Parses a single `avatar` image from a multipart request */
export const uploadAvatar: RequestHandler = (req, res, next) => {
  avatarUpload.single("avatar")(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      return next(new ApiError(400, avatarMessages[err.code] ?? err.message));
    }
    next(err);
  });
};

// ---------- Rich text images ----------

// SVG is excluded: images are shown inline, and SVG can carry scripts
const RICH_TEXT_IMAGE_TYPES = /^image\/(png|jpe?g|gif|webp)$/;

const richTextImageUpload = multer({
  storage,
  limits: { fileSize: MAX_ATTACHMENT_SIZE, files: 1 },
  fileFilter: (req, file, cb) => {
    if (RICH_TEXT_IMAGE_TYPES.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new ApiError(400, "Images must be PNG, JPEG, GIF or WebP"));
    }
  },
});

const richTextImageMessages: Partial<Record<multer.ErrorCode, string>> = {
  LIMIT_FILE_SIZE: `Images must be ${MAX_ATTACHMENT_SIZE / 1024 / 1024} MB or smaller`,
  LIMIT_FILE_COUNT: "Upload one image at a time",
  LIMIT_UNEXPECTED_FILE: 'Upload the image in the "image" field',
};

/** Parses a single `image` pasted or dropped into a rich text editor */
export const uploadRichTextImage: RequestHandler = (req, res, next) => {
  richTextImageUpload.single("image")(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      return next(
        new ApiError(400, richTextImageMessages[err.code] ?? err.message),
      );
    }
    next(err);
  });
};
