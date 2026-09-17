import { http } from "@/lib/axios";
import type { LoginResult, User } from "@/types/models";

export interface RegisterInput {
  email: string;
  username: string;
  password: string;
  fullName?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface ChangePasswordInput {
  oldPassword: string;
  newPassword: string;
}

export interface ResetPasswordInput {
  resetToken: string;
  newPassword: string;
}

// Endpoints under /api/v1/auth — see backend/src/routes/auth.routes.ts
export const authApi = {
  register: (body: RegisterInput) =>
    http.post<{ user: User; verificationRequired: boolean }>(
      "/auth/register",
      body,
    ),

  login: (body: LoginInput) => http.post<LoginResult>("/auth/login", body),

  logout: () => http.post<Record<string, never>>("/auth/logout"),

  currentUser: () => http.get<User>("/auth/current-user"),

  verifyEmail: (verificationToken: string) =>
    http.get<{ isEmailVerified: boolean; joinedProjects: number }>(
      `/auth/verify-email/${encodeURIComponent(verificationToken)}`,
    ),

  // Public: works for signed-out users who can't log in until verified
  resendEmailVerification: (email: string) =>
    http.post<Record<string, never>>("/auth/resend-email-verification", {
      email,
    }),

  forgotPassword: (email: string) =>
    http.post<Record<string, never>>("/auth/forgot-password", { email }),

  resetPassword: ({ resetToken, newPassword }: ResetPasswordInput) =>
    http.post<Record<string, never>>(
      `/auth/reset-password/${encodeURIComponent(resetToken)}`,
      { newPassword },
    ),

  changePassword: (body: ChangePasswordInput) =>
    http.post<Record<string, never>>("/auth/change-password", body),

  updateAccount: (body: { fullName?: string; emailNotifications?: boolean }) =>
    http.patch<User>("/auth/update-account", body),

  updateAvatar: (file: File) => {
    const form = new FormData();
    form.append("avatar", file);
    return http.patch<User>("/auth/avatar", form, { timeout: 60_000 });
  },

  removeAvatar: () => http.delete<User>("/auth/avatar"),

  // Normally called by the axios interceptor; exposed for completeness
  refreshToken: () => http.post<Record<string, never>>("/auth/refresh-token"),
};
