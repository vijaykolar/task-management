import mongoose, { Schema, type HydratedDocument, type Model } from "mongoose";
import brcypt from "bcrypt";
import jwt, { type SignOptions } from "jsonwebtoken";
import crypto from "crypto";

export interface UserAvatar {
  url: string;
  localPath: string;
}

export interface TemporaryToken {
  unHashedToken: string;
  hashedToken: string;
  tokenExpiry: Date;
}

export interface IUser {
  avatar: UserAvatar;
  username: string;
  email: string;
  fullName?: string;
  password: string;
  isEmailVerified: boolean;
  /** Email me about assignments and mentions */
  emailNotifications: boolean;
  refreshToken?: string;
  forgotPasswordToken?: string;
  forgotPasswordExpiry?: Date;
  emailVerificationToken?: string;
  emailVerificationExpiry?: Date;
  /** Tokens issued before this moment are rejected */
  passwordChangedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserMethods {
  isPasswordCorrect(password: string): Promise<boolean>;
  generateAccessToken(): string;
  generateRefreshToken(): string;
  generateTemporaryToken(): TemporaryToken;
}

/** Never sent to clients, even if a query forgets to exclude them */
export const SENSITIVE_USER_FIELDS = [
  "password",
  "refreshToken",
  "forgotPasswordToken",
  "forgotPasswordExpiry",
  "emailVerificationToken",
  "emailVerificationExpiry",
  "passwordChangedAt",
] as const;

/** Projection that excludes SENSITIVE_USER_FIELDS, for .select() */
export const SAFE_USER_SELECT = SENSITIVE_USER_FIELDS.map((f) => `-${f}`).join(
  " ",
);

export type UserModel = Model<IUser, Record<string, never>, IUserMethods>;
export type UserDocument = HydratedDocument<IUser, IUserMethods>;

const userSchema = new Schema<IUser, UserModel, IUserMethods>(
  {
    avatar: {
      type: {
        url: String,
        localPath: String,
      },
      default: {
        url: `https://placehold.co/200x200`,
        localPath: "",
      },
    },
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    fullName: {
      type: String,
      trim: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    emailNotifications: {
      type: Boolean,
      default: true,
    },
    refreshToken: {
      type: String,
    },
    forgotPasswordToken: {
      type: String,
    },
    forgotPasswordExpiry: {
      type: Date,
    },
    emailVerificationToken: {
      type: String,
    },
    emailVerificationExpiry: {
      type: Date,
    },
    passwordChangedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        for (const field of SENSITIVE_USER_FIELDS) delete ret[field];
        return ret;
      },
    },
  },
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  this.password = await brcypt.hash(this.password, 10);
  if (!this.isNew) {
    // 1s back-dated so tokens issued right after this save stay valid
    this.passwordChangedAt = new Date(Date.now() - 1000);
  }
  next();
});

userSchema.methods.isPasswordCorrect = async function (
  this: UserDocument,
  password: string,
): Promise<boolean> {
  if (typeof password !== "string" || !this.password) return false;
  return await brcypt.compare(password, this.password);
};

userSchema.methods.generateAccessToken = function (this: UserDocument): string {
  return jwt.sign(
    {
      _id: this._id,
      email: this.email,
      username: this.username,
    },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRY as SignOptions["expiresIn"] },
  );
};

userSchema.methods.generateRefreshToken = function (
  this: UserDocument,
): string {
  return jwt.sign(
    {
      _id: this._id,
    },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRY as SignOptions["expiresIn"] },
  );
};

userSchema.methods.generateTemporaryToken = function (): TemporaryToken {
  const unHashedToken = crypto.randomBytes(20).toString("hex");

  const hashedToken = crypto
    .createHash("sha256")
    .update(unHashedToken)
    .digest("hex");

  const tokenExpiry = new Date(Date.now() + 20 * 60 * 1000); //20 mins
  return { unHashedToken, hashedToken, tokenExpiry };
};

export const User = mongoose.model<IUser, UserModel>("User", userSchema);
