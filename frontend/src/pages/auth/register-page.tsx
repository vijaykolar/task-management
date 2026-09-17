import { zodResolver } from "@hookform/resolvers/zod";
import { CircleCheckIcon, MailCheckIcon } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { Link, useSearchParams } from "react-router";

import { AuthHeading } from "@/components/auth/auth-layout";
import { FormAlert } from "@/components/common/form-alert";
import { PasswordInput } from "@/components/common/password-input";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useRegister } from "@/features/auth/hooks";
import { registerSchema, type RegisterValues } from "@/features/auth/schemas";
import { applyServerFieldErrors } from "@/lib/form-errors";

export function RegisterPage() {
  const register = useRegister();
  const [searchParams] = useSearchParams();
  const invitedEmail = searchParams.get("email") ?? "";

  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: "",
      username: "",
      email: invitedEmail,
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = form.handleSubmit(
    ({ fullName, username, email, password }) => {
      register.mutate(
        { username, email, password, fullName: fullName || undefined },
        {
          onError: (error) => {
            applyServerFieldErrors(error, form.setError, [
              "email",
              "username",
              "password",
              "fullName",
            ]);
          },
        },
      );
    },
  );

  if (register.isSuccess) {
    // Demo mode (AUTO_VERIFY_EMAIL) creates verified accounts and sends no email
    if (register.data.data.verificationRequired === false) {
      return (
        <div className="flex flex-col items-center text-center">
          <div className="mb-6 flex size-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
            <CircleCheckIcon className="size-7" />
          </div>
          <AuthHeading
            title="Account created"
            description="Your account is ready — sign in to get started."
          />
          <Button asChild size="lg" className="w-full">
            <Link to="/login">Continue to sign in</Link>
          </Button>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center text-center">
        <div className="mb-6 flex size-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
          <MailCheckIcon className="size-7" />
        </div>
        <AuthHeading
          title="Check your inbox"
          description={
            <>
              We sent a verification link to{" "}
              <span className="font-medium text-foreground">
                {register.variables?.email}
              </span>
              . Verify your email, then sign in.
            </>
          }
        />
        <Button asChild size="lg" className="w-full">
          <Link to="/login">Continue to sign in</Link>
        </Button>
        <p className="mt-6 text-sm text-muted-foreground">
          Didn&apos;t get it?{" "}
          <Link
            to="/resend-verification"
            state={{ email: register.variables?.email }}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Resend the email
          </Link>
        </p>
      </div>
    );
  }

  return (
    <>
      <AuthHeading
        title={invitedEmail ? "Accept your invitation" : "Create an account"}
        description={
          invitedEmail
            ? "Create your account with the invited email. You'll join the project after verifying it."
            : "Start managing projects with your team"
        }
      />

      <form onSubmit={onSubmit} noValidate>
        <FieldGroup>
          <Controller
            control={form.control}
            name="fullName"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="fullName">
                  Full name{" "}
                  <span className="font-normal text-muted-foreground">
                    (optional)
                  </span>
                </FieldLabel>
                <Input
                  {...field}
                  id="fullName"
                  autoComplete="name"
                  placeholder="Jane Doe"
                  aria-invalid={fieldState.invalid}
                  autoFocus
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />

          <Controller
            control={form.control}
            name="username"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="username">Username</FieldLabel>
                <Input
                  {...field}
                  onChange={(e) => field.onChange(e.target.value.toLowerCase())}
                  id="username"
                  autoComplete="username"
                  placeholder="janedoe"
                  aria-invalid={fieldState.invalid}
                />
                {fieldState.error ? (
                  <FieldError errors={[fieldState.error]} />
                ) : (
                  <FieldDescription>
                    Lowercase, at least 3 characters.
                  </FieldDescription>
                )}
              </Field>
            )}
          />

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
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />

          <div className="grid gap-5 sm:grid-cols-2 sm:gap-3">
            <Controller
              control={form.control}
              name="password"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <PasswordInput
                    {...field}
                    id="password"
                    autoComplete="new-password"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.error ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : (
                    <FieldDescription>
                      8+ characters, a letter and a number
                    </FieldDescription>
                  )}
                </Field>
              )}
            />
            <Controller
              control={form.control}
              name="confirmPassword"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="confirmPassword">Confirm</FieldLabel>
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
          </div>

          <FormAlert
            message={
              register.error?.statusCode !== 422
                ? register.error?.message
                : null
            }
          />

          <Button type="submit" size="lg" disabled={register.isPending}>
            {register.isPending && <Spinner />}
            Create account
          </Button>
        </FieldGroup>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          to="/login"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </>
  );
}
