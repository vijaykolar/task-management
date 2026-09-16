import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router";
import { toast } from "sonner";

import { AuthHeading } from "@/components/auth/auth-layout";
import type { RedirectState } from "@/components/auth/route-guards";
import { FormAlert } from "@/components/common/form-alert";
import { MailWarningIcon } from "lucide-react";
import { PasswordInput } from "@/components/common/password-input";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useLogin, useResendEmailVerification } from "@/features/auth/hooks";
import { loginSchema, type LoginValues } from "@/features/auth/schemas";
import { hasErrorCode } from "@/lib/axios";
import { applyServerFieldErrors } from "@/lib/form-errors";
import { displayName } from "@/lib/format";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = (location.state as RedirectState | null)?.from ?? "/";
  const login = useLogin();
  const resend = useResendEmailVerification();
  const needsVerification = hasErrorCode(login.error, "EMAIL_NOT_VERIFIED");

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = form.handleSubmit((values) => {
    login.mutate(values, {
      onSuccess: (res) => {
        toast.success(`Welcome back, ${displayName(res.data.user)}!`);
        navigate(redirectTo, { replace: true });
      },
      onError: (error) => {
        applyServerFieldErrors(error, form.setError, ["email", "password"]);
      },
    });
  });

  return (
    <>
      <AuthHeading
        title="Welcome back"
        description="Sign in to your account to continue"
      />

      <form onSubmit={onSubmit} noValidate>
        <FieldGroup>
          <Controller
            control={form.control}
            name="email"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  {...field}
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  aria-invalid={fieldState.invalid}
                  autoFocus
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />

          <Controller
            control={form.control}
            name="password"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <div className="flex items-center">
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <Link
                    to="/forgot-password"
                    className="ml-auto text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <PasswordInput
                  {...field}
                  id="password"
                  autoComplete="current-password"
                  aria-invalid={fieldState.invalid}
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />

          {needsVerification ? (
            <div
              role="alert"
              className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm"
            >
              <div className="flex items-start gap-2 text-amber-800 dark:text-amber-300">
                <MailWarningIcon className="mt-0.5 size-4 shrink-0" />
                <span>
                  Your email isn&apos;t verified yet. Check your inbox for the
                  verification link, or send a new one.
                </span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                disabled={resend.isPending || resend.isSuccess}
                onClick={() => resend.mutate(form.getValues("email"))}
              >
                {resend.isPending && <Spinner />}
                {resend.isSuccess
                  ? "Verification email sent"
                  : "Resend verification email"}
              </Button>
            </div>
          ) : (
            <FormAlert
              message={
                login.error?.statusCode !== 422 ? login.error?.message : null
              }
            />
          )}

          <Button type="submit" size="lg" disabled={login.isPending}>
            {login.isPending && <Spinner />}
            Sign in
          </Button>
        </FieldGroup>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link
          to="/register"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Create one
        </Link>
      </p>
    </>
  );
}
