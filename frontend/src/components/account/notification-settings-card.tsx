import { BellRingIcon } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { useUpdateAccount } from "@/features/auth/hooks";
import type { User } from "@/types/models";

export function NotificationSettingsCard({ user }: { user: User }) {
  const updateAccount = useUpdateAccount();
  // Optimistic: show the requested value while saving
  const checked = updateAccount.isPending
    ? (updateAccount.variables?.emailNotifications ?? user.emailNotifications)
    : user.emailNotifications !== false;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellRingIcon className="size-4" />
          Notifications
        </CardTitle>
        <CardDescription>
          In-app notifications are always on. Choose what we also email you.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor="email-notifications">
              Email notifications
            </FieldLabel>
            <FieldDescription>
              When someone assigns you a task or @mentions you in a comment.
            </FieldDescription>
          </FieldContent>
          <Switch
            id="email-notifications"
            checked={checked}
            disabled={updateAccount.isPending}
            onCheckedChange={(emailNotifications) =>
              updateAccount.mutate({ emailNotifications })
            }
          />
        </Field>
      </CardContent>
    </Card>
  );
}
