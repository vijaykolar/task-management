import mongoose from "mongoose";
import { ApiError } from "./api-error.js";

/** Converts a route param to an ObjectId, or throws 400 instead of a 500 CastError */
export const toObjectId = (value: unknown, label = "id") => {
  if (typeof value !== "string" || !/^[a-f\d]{24}$/i.test(value)) {
    throw new ApiError(400, `Invalid ${label}`);
  }
  return new mongoose.Types.ObjectId(value);
};
