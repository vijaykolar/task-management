// A shared account the sign-in form is prefilled with, so anyone trying the
// app can get in without signing up. Vite inlines these into the bundle, so
// the password is public by design — only ever a throwaway demo account.
const demoEmail = import.meta.env.VITE_DEMO_EMAIL?.trim();
const demoPassword = import.meta.env.VITE_DEMO_PASSWORD;

export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? "/api/v1",
  isDev: import.meta.env.DEV,
  /** `null` when no demo account is configured */
  demoCredentials:
    demoEmail && demoPassword
      ? { email: demoEmail, password: demoPassword }
      : null,
} as const;
