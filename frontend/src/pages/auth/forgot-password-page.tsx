import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeftIcon, MailIcon } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { Link } from "react-router";

import { AuthHeading } from "@/components/auth/auth-layout";
import { FormAlert } from "@/components/common/form-alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useForgotPassword } from "@/features/auth/hooks";
import {
  forgotPasswordSchema,
  type ForgotPasswordValues,
} from "@/features/auth/schemas";
import { applyServerFieldErrors } from "@/lib/form-errors";

function BackToLogin() {
  return (
    <Button asChild variant="ghost" className="mt-6 w-full">
      <Link to="/login">
        <ArrowLeftIcon />
        Back to sign in
      </Link>
    </Button>
  );
}

export function ForgotPasswordPage() {
  const forgotPassword = useForgotPassword();

  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = form.handleSubmit(({ email }) => {
    forgotPassword.mutate(email, {
      onError: (error) =>
        applyServerFieldErrors(error, form.setError, ["email"]),
    });
  });

  if (forgotPassword.isSuccess) {
    return (
      <div className="flex flex-col items-center text-center">
        <div className="mb-6 flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <MailIcon className="size-7" />
        </div>
        <AuthHeading
          title="Check your email"
          description={
            <>
              If an account exists for{" "}
              <span className="font-medium text-foreground">
                {forgotPassword.variables}
              </span>
              , you&apos;ll receive a link to reset your password. The link
              expires in 20 minutes.
            </>
          }
        />
        <Button
          variant="outline"
          className="w-full"
          onClick={() => forgotPassword.reset()}
        >
          Use a different email
        </Button>
        <BackToLogin />
      </div>
    );
  }

  return (
    <>
      <AuthHeading
        title="Forgot your password?"
        description="Enter your email and we'll send you a reset link"
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

          <FormAlert
            message={
              forgotPassword.error?.statusCode !== 422
                ? forgotPassword.error?.message
                : null
            }
          />

          <Button type="submit" size="lg" disabled={forgotPassword.isPending}>
            {forgotPassword.isPending && <Spinner />}
            Send reset link
          </Button>
        </FieldGroup>
      </form>

      <BackToLogin />
    </>
  );
}
