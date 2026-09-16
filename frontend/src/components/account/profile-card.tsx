import { zodResolver } from "@hookform/resolvers/zod";
import {
  AtSignIcon,
  BadgeCheckIcon,
  CalendarIcon,
  CameraIcon,
  MailIcon,
  MailWarningIcon,
  LockIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";
import { useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { UserAvatar } from "@/components/common/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import {
  useRemoveAvatar,
  useResendEmailVerification,
  useUpdateAccount,
  useUpdateAvatar,
} from "@/features/auth/hooks";
import { profileSchema, type ProfileValues } from "@/features/auth/schemas";
import { applyServerFieldErrors } from "@/lib/form-errors";
import { displayName, formatBytes, formatDate } from "@/lib/format";
import type { User } from "@/types/models";

// Mirrors backend/src/middlewares/multer.middleware.ts
const MAX_AVATAR_SIZE = 2 * 1024 * 1024;
const AVATAR_TYPES = "image/png,image/jpeg,image/webp,image/gif";

const hasCustomAvatar = (user: User) =>
  !!user.avatar?.url && !user.avatar.url.includes("placehold.co");

export function ProfileCard({ user }: { user: User }) {
  const [isEditing, setIsEditing] = useState(false);
  const resend = useResendEmailVerification();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>
          Your name and avatar are shown to teammates.
        </CardDescription>
        {!isEditing && (
          <CardAction>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(true)}
            >
              <PencilIcon />
              Edit
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        <AvatarEditor user={user} />

        {isEditing ? (
          <ProfileForm user={user} onDone={() => setIsEditing(false)} />
        ) : (
          <dl className="divide-y rounded-lg border text-sm">
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <dt className="flex items-center gap-2 text-muted-foreground">
                <MailIcon className="size-4" />
                Email
              </dt>
              <dd className="flex min-w-0 items-center gap-2">
                <span className="truncate">{user.email}</span>
                {user.isEmailVerified ? (
                  <Badge
                    variant="outline"
                    className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  >
                    <BadgeCheckIcon data-icon="inline-start" />
                    Verified
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                  >
                    Unverified
                  </Badge>
                )}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <dt className="flex items-center gap-2 text-muted-foreground">
                <AtSignIcon className="size-4" />
                Username
              </dt>
              <dd>{user.username}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <dt className="flex items-center gap-2 text-muted-foreground">
                <CalendarIcon className="size-4" />
                Member since
              </dt>
              <dd>{formatDate(user.createdAt)}</dd>
            </div>
          </dl>
        )}

        {!user.isEmailVerified && (
          <div className="flex flex-col gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 sm:flex-row sm:items-center">
            <MailWarningIcon className="size-5 shrink-0 text-amber-600" />
            <p className="text-sm">
              Verify your email to secure your account. Links expire after 20
              minutes.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="sm:ml-auto"
              onClick={() =>
                resend.mutate(user.email, {
                  onSuccess: () =>
                    toast.success("Verification email sent. Check your inbox."),
                })
              }
              disabled={resend.isPending}
            >
              {resend.isPending && <Spinner />}
              Resend email
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AvatarEditor({ user }: { user: User }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const updateAvatar = useUpdateAvatar();
  const removeAvatar = useRemoveAvatar();
  const isBusy = updateAvatar.isPending || removeAvatar.isPending;

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!AVATAR_TYPES.split(",").includes(file.type)) {
      toast.error("Choose a PNG, JPEG, WebP or GIF image");
      return;
    }
    if (file.size > MAX_AVATAR_SIZE) {
      toast.error(`Avatar must be ${formatBytes(MAX_AVATAR_SIZE)} or smaller`);
      return;
    }
    updateAvatar.mutate(file);
  };

  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        <UserAvatar user={user} size="lg" className="size-20 text-xl" />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isBusy}
          className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100 disabled:opacity-100"
          aria-label="Change avatar"
        >
          {isBusy ? (
            <Spinner className="size-5" />
          ) : (
            <CameraIcon className="size-5" />
          )}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={AVATAR_TYPES}
          className="sr-only"
          onChange={(e) => {
            handleFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      <div className="min-w-0 space-y-2">
        <div>
          <p className="truncate font-heading text-lg font-semibold">
            {displayName(user)}
          </p>
          <p className="truncate text-sm text-muted-foreground">
            @{user.username}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="xs"
            onClick={() => inputRef.current?.click()}
            disabled={isBusy}
          >
            <CameraIcon />
            {hasCustomAvatar(user) ? "Change photo" : "Upload photo"}
          </Button>
          {hasCustomAvatar(user) && (
            <Button
              variant="ghost"
              size="xs"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => removeAvatar.mutate()}
              disabled={isBusy}
            >
              <Trash2Icon />
              Remove
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function ProfileForm({ user, onDone }: { user: User; onDone: () => void }) {
  const updateAccount = useUpdateAccount();

  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { fullName: user.fullName ?? "" },
  });

  const onSubmit = form.handleSubmit((values) => {
    updateAccount.mutate(values, {
      onSuccess: onDone,
      onError: (error) => {
        if (!applyServerFieldErrors(error, form.setError, ["fullName"])) {
          toast.error(error.message);
        }
      },
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <Controller
          control={form.control}
          name="fullName"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="profile-fullName">Full name</FieldLabel>
              <Input
                {...field}
                id="profile-fullName"
                autoComplete="name"
                placeholder="Jane Doe"
                aria-invalid={fieldState.invalid}
                autoFocus
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Field data-disabled>
          <FieldLabel htmlFor="profile-username">Username</FieldLabel>
          <InputGroup>
            <InputGroupAddon>
              <AtSignIcon />
            </InputGroupAddon>
            <InputGroupInput
              id="profile-username"
              value={user.username}
              readOnly
              disabled
            />
            <InputGroupAddon align="inline-end">
              <LockIcon />
            </InputGroupAddon>
          </InputGroup>
          <FieldDescription>Usernames can&apos;t be changed.</FieldDescription>
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={updateAccount.isPending || !form.formState.isDirty}
          >
            {updateAccount.isPending && <Spinner />}
            Save profile
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
