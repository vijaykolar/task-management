import { CrownIcon, ShieldIcon, UserIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { roleLabels } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types/models";

const roleStyles: Record<UserRole, string> = {
  admin:
    "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  project_admin:
    "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  member:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
};

const roleIcons = {
  admin: CrownIcon,
  project_admin: ShieldIcon,
  member: UserIcon,
} satisfies Record<UserRole, unknown>;

export function RoleBadge({
  role,
  className,
}: {
  role: UserRole;
  className?: string;
}) {
  const Icon = roleIcons[role];
  return (
    <Badge variant="outline" className={cn(roleStyles[role], className)}>
      <Icon data-icon="inline-start" />
      {roleLabels[role]}
    </Badge>
  );
}
