import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { roleDescriptions, roleLabels } from "@/lib/permissions";
import { AvailableUserRoles, type UserRole } from "@/types/models";

interface RoleSelectProps {
  value: UserRole;
  onValueChange: (role: UserRole) => void;
  disabled?: boolean;
  size?: "sm" | "default";
  id?: string;
  className?: string;
  "aria-invalid"?: boolean;
  "aria-label"?: string;
}

export function RoleSelect({
  value,
  onValueChange,
  size,
  className,
  ...props
}: RoleSelectProps) {
  return (
    <Select
      value={value}
      onValueChange={(v) => onValueChange(v as UserRole)}
      disabled={props.disabled}
    >
      <SelectTrigger size={size} className={className} {...props}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" align="end">
        {AvailableUserRoles.map((role) => (
          <SelectItem key={role} value={role} className="py-2">
            <div className="flex flex-col">
              <span>{roleLabels[role]}</span>
              <span className="text-xs text-muted-foreground in-data-[slot=select-value]:hidden">
                {roleDescriptions[role]}
              </span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
