import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2Icon } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { Link, useParams } from "react-router";

import { AuthHeading } from "@/components/auth/auth-layout";
import { FormAlert } from "@/components/common/form-alert";
import { PasswordInput } from "@/components/common/password-input";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { useResetPassword } from "@/features/auth/hooks";
import {
  resetPasswordSchema,
  type ResetPasswordValues,
} from "@/features/auth/schemas";
import { applyServerFieldErrors } from "@/lib/form-errors";

export function ResetPasswordPage() {
  const { resetToken = "" } = useParams();
  const resetPassword = useResetPassword();

  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  const onSubmit = form.handleSubmit(({ newPassword }) => {
    resetPassword.mutate(
      { resetToken, newPassword },
      {
        onError: (error) =>
          applyServerFieldErrors(error, form.setError, ["newPassword"]),
      },
    );
  });

  if (resetPassword.isSuccess) {
    return (
      <div className="flex flex-col items-center text-center">
        <div className="mb-6 flex size-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
          <CheckCircle2Icon className="size-7" />
        </div>
        <AuthHeading
          title="Password updated"
          description="Your password has been reset and all devices were signed out. Sign in with your new password."
        />
        <Button asChild size="lg" className="w-full">
          <Link to="/login">Sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <AuthHeading
        title="Set a new password"
        description="Choose a strong password you haven't used before"
      />

      <form onSubmit={onSubmit} noValidate>
        <FieldGroup>
          <Controller
            control={form.control}
            name="newPassword"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="newPassword">New password</FieldLabel>
                <PasswordInput
                  {...field}
                  id="newPassword"
                  autoComplete="new-password"
                  aria-invalid={fieldState.invalid}
                  autoFocus
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name="confirmPassword"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="confirmPassword">
                  Confirm new password
                </FieldLabel>
                <PasswordInput
                  {...field}
                  id="confirmPassword"
                  autoComplete="new-password"
                  aria-invalid={fieldState.invalid}
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />

          <FormAlert
            message={
              !resetPassword.error || resetPassword.error.statusCode === 422
                ? null
                : resetPassword.error.statusCode === 400
                  ? `${resetPassword.error.message}. Request a new link below.`
                  : resetPassword.error.message
            }
          />

          <Button type="submit" size="lg" disabled={resetPassword.isPending}>
            {resetPassword.isPending && <Spinner />}
            Reset password
          </Button>
        </FieldGroup>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Link expired?{" "}
        <Link
          to="/forgot-password"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Request a new one
        </Link>
      </p>
    </>
  );
}
