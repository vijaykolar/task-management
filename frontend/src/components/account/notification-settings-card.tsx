import { BellRingIcon, GlobeIcon } from "lucide-react";

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
import { browserTimeZone, useUpdateAccount } from "@/features/auth/hooks";
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
          In-app notifications are always on: assignments, @mentions and updates
          on tasks you watch. Choose what we also email you.
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

        <Field orientation="horizontal" className="border-t pt-4">
          <FieldContent>
            <FieldLabel>
              <GlobeIcon className="size-4 text-muted-foreground" />
              Time zone
            </FieldLabel>
            <FieldDescription>
              Due date reminders arrive on your local day. Taken from this
              browser, so it follows you when you travel.
            </FieldDescription>
          </FieldContent>
          <span className="text-sm font-medium">
            {user.timeZone ?? browserTimeZone()}
          </span>
        </Field>
      </CardContent>
    </Card>
  );
}
