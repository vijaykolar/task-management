import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRoundIcon } from "lucide-react";
import { Controller, useForm } from "react-hook-form";

import { NotificationSettingsCard } from "@/components/account/notification-settings-card";
import { ProfileCard } from "@/components/account/profile-card";
import { FormAlert } from "@/components/common/form-alert";
import { PageHeader } from "@/components/common/page-header";
import { PasswordInput } from "@/components/common/password-input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { useChangePassword, useCurrentUser } from "@/features/auth/hooks";
import {
  changePasswordSchema,
  type ChangePasswordValues,
} from "@/features/auth/schemas";
import { applyServerFieldErrors } from "@/lib/form-errors";

function ChangePasswordCard() {
  const changePassword = useChangePassword();

  const form = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { oldPassword: "", newPassword: "", confirmPassword: "" },
  });

  const onSubmit = form.handleSubmit(({ oldPassword, newPassword }) => {
    changePassword.mutate(
      { oldPassword, newPassword },
      {
        onSuccess: () => form.reset(),
        onError: (error) => {
          if (error.statusCode === 400) {
            form.setError("oldPassword", { message: error.message });
          } else {
            applyServerFieldErrors(error, form.setError, [
              "oldPassword",
              "newPassword",
            ]);
          }
        },
      },
    );
  });

  const errorMessage =
    changePassword.error &&
    ![400, 422].includes(changePassword.error.statusCode)
      ? changePassword.error.message
      : null;

  return (
    <Card>
      <form onSubmit={onSubmit} noValidate className="contents">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRoundIcon className="size-4" />
            Change password
          </CardTitle>
          <CardDescription>
            At least 8 characters with a letter and a number. Other devices will
            be signed out; you&apos;ll stay signed in on this device.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Controller
              control={form.control}
              name="oldPassword"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="oldPassword">
                    Current password
                  </FieldLabel>
                  <PasswordInput
                    {...field}
                    id="oldPassword"
                    autoComplete="current-password"
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
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
            <FormAlert message={errorMessage} />
          </FieldGroup>
        </CardContent>
        <CardFooter className="justify-end border-t">
          <Button type="submit" disabled={changePassword.isPending}>
            {changePassword.isPending && <Spinner />}
            Update password
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

export function AccountPage() {
  const { data: user } = useCurrentUser();
  return (
    <>
      <PageHeader
        title="Account settings"
        description="Manage your profile and security."
      />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        {user && <ProfileCard user={user} />}
        <div className="grid gap-6">
          <ChangePasswordCard />
          {user && <NotificationSettingsCard user={user} />}
        </div>
      </div>
    </>
  );
}
