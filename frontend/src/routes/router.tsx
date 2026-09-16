import { createBrowserRouter, type UIMatch } from "react-router";

import { AuthLayout } from "@/components/auth/auth-layout";
import { GuestOnly, RequireAuth } from "@/components/auth/route-guards";
import type { RouteHandle } from "@/components/layout/app-breadcrumbs";
import { AppLayout } from "@/components/layout/app-layout";
import { ProjectCrumb } from "@/components/projects/project-crumb";
import { AccountPage } from "@/pages/account-page";
import { ForgotPasswordPage } from "@/pages/auth/forgot-password-page";
import { LoginPage } from "@/pages/auth/login-page";
import { RegisterPage } from "@/pages/auth/register-page";
import { ResendVerificationPage } from "@/pages/auth/resend-verification-page";
import { ResetPasswordPage } from "@/pages/auth/reset-password-page";
import { VerifyEmailPage } from "@/pages/auth/verify-email-page";
import { NotFoundPage } from "@/pages/not-found-page";
import { NotificationsPage } from "@/pages/notifications-page";
import { MyWorkPage } from "@/pages/my-work-page";
import { ProjectDetailPage } from "@/pages/project-detail-page";
import { ProjectsPage } from "@/pages/projects-page";

const handle = (crumb: RouteHandle["crumb"]): RouteHandle => ({ crumb });

export const router = createBrowserRouter([
  {
    element: <AuthLayout />,
    children: [
      {
        element: <GuestOnly />,
        children: [
          { path: "/login", element: <LoginPage /> },
          { path: "/register", element: <RegisterPage /> },
          { path: "/forgot-password", element: <ForgotPasswordPage /> },
          {
            path: "/reset-password/:resetToken",
            element: <ResetPasswordPage />,
          },
        ],
      },
      // Reachable whether or not the user is logged in
      { path: "/resend-verification", element: <ResendVerificationPage /> },
      {
        path: "/verify-email/:verificationToken",
        element: <VerifyEmailPage />,
      },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          {
            path: "/",
            handle: handle(() => "Projects"),
            children: [
              { index: true, element: <ProjectsPage /> },
              {
                path: "projects/:projectId",
                element: <ProjectDetailPage />,
                handle: handle((match: UIMatch) => (
                  <ProjectCrumb projectId={match.params.projectId!} />
                )),
              },
            ],
          },
          {
            path: "/my-work",
            element: <MyWorkPage />,
            handle: handle(() => "My work"),
          },
          {
            path: "/notifications",
            element: <NotificationsPage />,
            handle: handle(() => "Notifications"),
          },
          {
            path: "/account",
            element: <AccountPage />,
            handle: handle(() => "Account"),
          },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);
