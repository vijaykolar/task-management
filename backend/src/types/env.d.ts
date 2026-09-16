declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV?: "development" | "production" | "test";
      PORT?: string;
      MONGO_URI: string;
      CORS_ORIGIN?: string;
      SERVER_URL?: string;
      TRUST_PROXY?: string;
      COOKIE_SAME_SITE?: "strict" | "lax" | "none";
      COOKIE_SECURE?: string;

      ACCESS_TOKEN_SECRET: string;
      ACCESS_TOKEN_EXPIRY: string;
      REFRESH_TOKEN_SECRET: string;
      REFRESH_TOKEN_EXPIRY: string;

      FORGOT_PASSWORD_REDIRECT_URL?: string;
      EMAIL_VERIFICATION_REDIRECT_URL?: string;

      MAILTRAP_SMTP_HOST?: string;
      MAILTRAP_SMTP_PORT?: string;
      MAILTRAP_SMTP_USER?: string;
      MAILTRAP_SMTP_PASS?: string;
      MAIL_FROM?: string;
    }
  }
}

export {};
