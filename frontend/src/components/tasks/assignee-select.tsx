import { UserRoundXIcon } from "lucide-react";

import { UserAvatar } from "@/components/common/user-avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMemberOptions } from "@/features/projects/hooks";
import { displayName } from "@/lib/format";

// Radix Select doesn't allow "" as an item value
const UNASSIGNED = "__unassigned__";

interface AssigneeSelectProps {
  projectId: string;
  /** User id, or "" for unassigned */
  value: string;
  onValueChange: (userId: string) => void;
  id?: string;
  className?: string;
  "aria-invalid"?: boolean;
}

export function AssigneeSelect({
  projectId,
  value,
  onValueChange,
  className,
  ...props
}: AssigneeSelectProps) {
  const members = useMemberOptions(projectId);

  return (
    <Select
      value={value || UNASSIGNED}
      onValueChange={(v) => onValueChange(v === UNASSIGNED ? "" : v)}
      disabled={members.isPending}
    >
      <SelectTrigger className={className} {...props}>
        <SelectValue placeholder="Loading members…" />
      </SelectTrigger>
      <SelectContent position="popper">
        <SelectItem value={UNASSIGNED}>
          <UserRoundXIcon />
          Unassigned
        </SelectItem>
        {members.data?.items.map(({ user }) => (
          <SelectItem key={user._id} value={user._id}>
            <UserAvatar user={user} size="sm" />
            {displayName(user)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
