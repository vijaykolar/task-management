import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeftIcon, MailIcon } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { Link, useLocation } from "react-router";

import { AuthHeading } from "@/components/auth/auth-layout";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useResendEmailVerification } from "@/features/auth/hooks";
import {
  forgotPasswordSchema,
  type ForgotPasswordValues,
} from "@/features/auth/schemas";

/** Public page: unverified users can't sign in, so they request a link here */
export function ResendVerificationPage() {
  const location = useLocation();
  const prefilledEmail =
    (location.state as { email?: string } | null)?.email ?? "";
  const resend = useResendEmailVerification();

  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: prefilledEmail },
  });

  const onSubmit = form.handleSubmit(({ email }) => resend.mutate(email));

  if (resend.isSuccess) {
    return (
      <div className="flex flex-col items-center text-center">
        <div className="mb-6 flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <MailIcon className="size-7" />
        </div>
        <AuthHeading
          title="Check your email"
          description={
            <>
              If{" "}
              <span className="font-medium text-foreground">
                {resend.variables}
              </span>{" "}
              belongs to an unverified account, a new verification link is on
              its way. It expires in 20 minutes.
            </>
          }
        />
        <Button asChild size="lg" className="w-full">
          <Link to="/login">Back to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <AuthHeading
        title="Resend verification email"
        description="Enter the email you signed up with and we'll send a new link"
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

          <Button type="submit" size="lg" disabled={resend.isPending}>
            {resend.isPending && <Spinner />}
            Send verification link
          </Button>
        </FieldGroup>
      </form>

      <Button asChild variant="ghost" className="mt-6 w-full">
        <Link to="/login">
          <ArrowLeftIcon />
          Back to sign in
        </Link>
      </Button>
    </>
  );
}
