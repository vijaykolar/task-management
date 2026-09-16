import { Router } from "express";
import {
  changeCurrentPassword,
  forgotPasswordRequest,
  removeAvatar,
  updateAccountDetails,
  updateAvatar,
  getCurrentUser,
  login,
  logoutUser,
  refreshAccessToken,
  registerUser,
  resendEmailVerification,
  resetForgotPassword,
  verifyEmail,
} from "../controllers/auth.controllers.js";
import { validate } from "../middlewares/validator.middleware.js";
import {
  userChangeCurrentPasswordValidator,
  userForgotPasswordValidator,
  userLoginValidator,
  userRegisterValidator,
  userResetForgotPasswordValidator,
  updateAccountValidator,
} from "../validators/index.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { uploadAvatar } from "../middlewares/multer.middleware.js";
import {
  emailSendingLimiter,
  loginAccountLimiter,
  loginIpLimiter,
  passwordLimiter,
  registerLimiter,
} from "../middlewares/rate-limit.middleware.js";

const router = Router();

// unsecured route
router
  .route("/register")
  .post(registerLimiter, userRegisterValidator(), validate, registerUser);
router
  .route("/login")
  .post(
    loginIpLimiter,
    loginAccountLimiter,
    userLoginValidator(),
    validate,
    login,
  );
router.route("/verify-email/:verificationToken").get(verifyEmail);
router.route("/refresh-token").post(refreshAccessToken);
router
  .route("/forgot-password")
  .post(
    emailSendingLimiter,
    userForgotPasswordValidator(),
    validate,
    forgotPasswordRequest,
  );
router
  .route("/reset-password/:resetToken")
  .post(
    passwordLimiter,
    userResetForgotPasswordValidator(),
    validate,
    resetForgotPassword,
  );

//secure routes
router.route("/logout").post(verifyJWT, logoutUser);
// GET per the PRD
router.route("/current-user").get(verifyJWT, getCurrentUser);
router
  .route("/change-password")
  .post(
    verifyJWT,
    passwordLimiter,
    userChangeCurrentPasswordValidator(),
    validate,
    changeCurrentPassword,
  );
// Public: unverified users can't sign in to request a new link
router
  .route("/resend-email-verification")
  .post(
    emailSendingLimiter,
    userForgotPasswordValidator(),
    validate,
    resendEmailVerification,
  );

router
  .route("/update-account")
  .patch(verifyJWT, updateAccountValidator(), validate, updateAccountDetails);
router
  .route("/avatar")
  .patch(verifyJWT, uploadAvatar, updateAvatar)
  .delete(verifyJWT, removeAvatar);

export default router;
