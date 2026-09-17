import crypto from "crypto";
import type { Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import type { Types } from "mongoose";
import {
  SAFE_USER_SELECT,
  User,
  type UserDocument,
} from "../models/user.models.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";
import { authCookieOptions } from "../utils/cookies.js";
import {
  emailVerificationMailgenContent,
  forgotPasswordMailgenContent,
  sendEmail,
} from "../utils/mail.js";
import { requireUser } from "../utils/request-user.js";
import { removeFiles } from "../utils/attachments.js";
import { acceptPendingInvites } from "../utils/invites.js";
import { frontendUrl, serverUrl } from "../utils/urls.js";

const generateAccessAndRefreshTokens = async (userId: Types.ObjectId) => {
  try {
    const user = await User.findById(userId);

    if (!user) {
      throw new ApiError(404, "User does not exist");
    }

    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });
    return { accessToken, refreshToken };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error("Token generation failed:", error);
    throw new ApiError(
      500,
      "Something went wrong while generating access token",
    );
  }
};

/**
 * Issues a new token pair and sets it as httpOnly cookies. Tokens are never
 * put in the response body, so page scripts (and XSS) can't read them.
 */
const startSession = async (res: Response, userId: Types.ObjectId) => {
  const { accessToken, refreshToken } =
    await generateAccessAndRefreshTokens(userId);
  const options = authCookieOptions();
  res
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options);
};

const clearSessionCookies = (res: Response) => {
  const options = authCookieOptions();
  res.clearCookie("accessToken", options).clearCookie("refreshToken", options);
};

const hashToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");

const normalizeEmail = (email: unknown) =>
  typeof email === "string" ? email.trim().toLowerCase() : "";

const emailVerificationUrl = (token: string) =>
  `${process.env.EMAIL_VERIFICATION_REDIRECT_URL || `${frontendUrl()}/verify-email`}/${token}`;

const passwordResetUrl = (token: string) =>
  `${process.env.FORGOT_PASSWORD_REDIRECT_URL || `${frontendUrl()}/reset-password`}/${token}`;

/** Issues a fresh verification token and emails it; throws if sending fails */
const sendVerificationEmail = async (user: UserDocument) => {
  const { unHashedToken, hashedToken, tokenExpiry } =
    user.generateTemporaryToken();

  user.emailVerificationToken = hashedToken;
  user.emailVerificationExpiry = tokenExpiry;
  await user.save({ validateBeforeSave: false });

  await sendEmail({
    email: user.email,
    subject: "Please verify your email",
    mailgenContent: emailVerificationMailgenContent(
      user.username,
      emailVerificationUrl(unHashedToken),
    ),
  });
};

/**
 * Demo mode: accounts are verified on creation and no email is sent, so the
 * app works without an email provider. Anyone can then register with an
 * address they don't own — keep it off for anything real.
 */
const autoVerifyEmail = () => process.env.AUTO_VERIFY_EMAIL === "true";

const registerUser = asyncHandler(async (req, res) => {
  const { username, password, fullName } = req.body;
  const email = normalizeEmail(req.body.email);

  const existedUser = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (existedUser) {
    throw new ApiError(409, "User with email or username already exists", []);
  }

  const skipVerification = autoVerifyEmail();
  const user = await User.create({
    email,
    password,
    username,
    fullName,
    isEmailVerified: skipVerification,
  });

  if (skipVerification) {
    // Invitations are normally accepted when the email is verified
    await acceptPendingInvites(user);
  } else {
    try {
      await sendVerificationEmail(user);
    } catch (error) {
      // Don't leave an account behind that can never be verified
      await User.deleteOne({ _id: user._id });
      throw error;
    }
  }

  const createdUser = await User.findById(user._id).select(SAFE_USER_SELECT);

  if (!createdUser) {
    throw new ApiError(500, "Something went wrong while registering a user");
  }

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        { user: createdUser, verificationRequired: !skipVerification },
        skipVerification
          ? "Account created. You can sign in now."
          : "User registered successfully and verification email has been sent on your email",
      ),
    );
});

const login = asyncHandler(async (req, res) => {
  const { password } = req.body;
  const email = normalizeEmail(req.body.email);

  if (!email) {
    throw new ApiError(400, "Email is required");
  }

  const user = await User.findOne({ email });

  // Same message for unknown email and wrong password: don't reveal accounts
  if (!user || !(await user.isPasswordCorrect(password))) {
    throw new ApiError(401, "Invalid email or password");
  }

  if (!user.isEmailVerified) {
    throw new ApiError(
      403,
      "Please verify your email address before signing in",
      [{ code: "EMAIL_NOT_VERIFIED" }],
    );
  }

  await startSession(res, user._id);
  const loggedInUser = await User.findById(user._id).select(SAFE_USER_SELECT);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { user: loggedInUser },
        "User logged in successfully",
      ),
    );
});

const logoutUser = asyncHandler(async (req, res) => {
  const currentUser = requireUser(req);

  await User.updateOne(
    { _id: currentUser._id },
    { $unset: { refreshToken: 1 } },
  );

  clearSessionCookies(res);
  return res.status(200).json(new ApiResponse(200, {}, "User logged out"));
});

const getCurrentUser = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(new ApiResponse(200, req.user, "Current user fetched successfully"));
});

const verifyEmail = asyncHandler<{ verificationToken: string }>(
  async (req, res) => {
    const { verificationToken } = req.params;

    if (!verificationToken) {
      throw new ApiError(400, "Email verification token is missing");
    }

    const user = await User.findOne({
      emailVerificationToken: hashToken(verificationToken),
      emailVerificationExpiry: { $gt: Date.now() },
    });

    if (!user) {
      throw new ApiError(400, "Token is invalid or expired");
    }

    user.emailVerificationToken = undefined;
    user.emailVerificationExpiry = undefined;

    user.isEmailVerified = true;
    await user.save({ validateBeforeSave: false });

    // Invitations sent to this address before the account existed
    const joinedProjects = await acceptPendingInvites(user);

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { isEmailVerified: true, joinedProjects },
          "Email is verified",
        ),
      );
  },
);

/**
 * Public: unverified users can't sign in, so they request a new link by email.
 * Always answers the same way so it can't be used to discover accounts.
 */
const resendEmailVerification = asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: normalizeEmail(req.body.email) });

  if (user && !user.isEmailVerified && !autoVerifyEmail()) {
    await sendVerificationEmail(user);
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        {},
        "If this email belongs to an unverified account, a new verification link has been sent",
      ),
    );
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  // Cookie only: tokens are no longer handed to clients in response bodies
  const incomingRefreshToken: unknown = req.cookies?.refreshToken;

  if (typeof incomingRefreshToken !== "string" || !incomingRefreshToken) {
    throw new ApiError(401, "Unauthorized access");
  }

  try {
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET,
    ) as JwtPayload;

    const user = await User.findById(decodedToken?._id);
    if (!user) {
      throw new ApiError(401, "Invalid refresh token");
    }

    // Also covers revoked sessions: logout / password reset unset the token
    if (incomingRefreshToken !== user.refreshToken) {
      throw new ApiError(401, "Refresh token is expired or already used");
    }

    if (!user.isEmailVerified) {
      throw new ApiError(401, "Email address is not verified");
    }

    await startSession(res, user._id);

    return res
      .status(200)
      .json(new ApiResponse(200, {}, "Access token refreshed"));
  } catch (error) {
    clearSessionCookies(res);
    if (error instanceof ApiError) throw error;
    throw new ApiError(401, "Invalid refresh token");
  }
});

const forgotPasswordRequest = asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: normalizeEmail(req.body.email) });

  // Same response whether or not the account exists
  const response = new ApiResponse(
    200,
    {},
    "If an account exists for this email, a password reset link has been sent",
  );
  if (!user) {
    return res.status(200).json(response);
  }

  const { unHashedToken, hashedToken, tokenExpiry } =
    user.generateTemporaryToken();

  user.forgotPasswordToken = hashedToken;
  user.forgotPasswordExpiry = tokenExpiry;

  await user.save({ validateBeforeSave: false });

  await sendEmail({
    email: user.email,
    subject: "Password reset request",
    mailgenContent: forgotPasswordMailgenContent(
      user.username,
      passwordResetUrl(unHashedToken),
    ),
  });

  return res.status(200).json(response);
});

const resetForgotPassword = asyncHandler<{ resetToken: string }>(
  async (req, res) => {
    const { resetToken } = req.params;
    const { newPassword } = req.body;

    const user = await User.findOne({
      forgotPasswordToken: hashToken(resetToken),
      forgotPasswordExpiry: { $gt: Date.now() },
    });

    if (!user) {
      throw new ApiError(400, "Reset link is invalid or has expired");
    }

    user.forgotPasswordExpiry = undefined;
    user.forgotPasswordToken = undefined;
    // Sign out every device: the old password may be what was compromised.
    // Clearing the refresh token ends sessions; passwordChangedAt (set on save)
    // invalidates access tokens that are still unexpired.
    user.refreshToken = undefined;
    user.password = newPassword;
    await user.save({ validateBeforeSave: false });

    clearSessionCookies(res);
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          {},
          "Password reset successfully. You have been signed out everywhere.",
        ),
      );
  },
);

const changeCurrentPassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  const user = await User.findById(req.user?._id);

  if (!user) {
    throw new ApiError(404, "User does not exist");
  }

  const isPasswordValid = await user.isPasswordCorrect(oldPassword);

  if (!isPasswordValid) {
    throw new ApiError(400, "Current password is incorrect");
  }

  user.password = newPassword;
  user.refreshToken = undefined;
  await user.save({ validateBeforeSave: false });

  // Other devices are signed out; this one gets a fresh session
  await startSession(res, user._id);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        {},
        "Password changed. Other devices have been signed out.",
      ),
    );
});

const DEFAULT_AVATAR = { url: "https://placehold.co/200x200", localPath: "" };

const updateAccountDetails = asyncHandler(async (req, res) => {
  const currentUser = requireUser(req);
  // Only the display name is editable; usernames are permanent
  const user = await User.findByIdAndUpdate(
    currentUser._id,
    {
      $set: {
        ...(req.body.fullName !== undefined && { fullName: req.body.fullName }),
        ...(req.body.emailNotifications !== undefined && {
          emailNotifications: req.body.emailNotifications,
        }),
      },
    },
    { new: true, runValidators: true },
  ).select(SAFE_USER_SELECT);

  if (!user) {
    throw new ApiError(404, "User does not exist");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Account details updated"));
});

const updateAvatar = asyncHandler(async (req, res) => {
  const currentUser = requireUser(req);
  const file = req.file;

  if (!file) {
    throw new ApiError(400, "Choose an image to upload");
  }

  const user = await User.findById(currentUser._id);
  if (!user) {
    await removeFiles([file.path]);
    throw new ApiError(404, "User does not exist");
  }

  const previousPath = user.avatar?.localPath;
  user.avatar = {
    url: `${serverUrl(req)}/images/${file.filename}`,
    localPath: file.path,
  };
  await user.save({ validateBeforeSave: false });
  await removeFiles([previousPath]);

  return res.status(200).json(new ApiResponse(200, user, "Avatar updated"));
});

const removeAvatar = asyncHandler(async (req, res) => {
  const currentUser = requireUser(req);
  const user = await User.findById(currentUser._id);

  if (!user) {
    throw new ApiError(404, "User does not exist");
  }

  const previousPath = user.avatar?.localPath;
  user.avatar = DEFAULT_AVATAR;
  await user.save({ validateBeforeSave: false });
  await removeFiles([previousPath]);

  return res.status(200).json(new ApiResponse(200, user, "Avatar removed"));
});

export {
  updateAccountDetails,
  updateAvatar,
  removeAvatar,
  registerUser,
  login,
  logoutUser,
  getCurrentUser,
  verifyEmail,
  resendEmailVerification,
  refreshAccessToken,
  forgotPasswordRequest,
  changeCurrentPassword,
  resetForgotPassword,
};
