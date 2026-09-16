import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { displayName, initials } from "@/lib/format";
import type { UserSummary } from "@/types/models";

const PLACEHOLDER_HOST = "placehold.co";

interface UserAvatarProps {
  user: Pick<UserSummary, "username" | "fullName" | "avatar">;
  size?: "sm" | "default" | "lg";
  className?: string;
}

export function UserAvatar({ user, size, className }: UserAvatarProps) {
  const url = user.avatar?.url;
  // The backend default avatar is a grey placeholder image; initials look better
  const hasRealAvatar = !!url && !url.includes(PLACEHOLDER_HOST);

  return (
    <Avatar size={size} className={className}>
      {hasRealAvatar && <AvatarImage src={url} alt={displayName(user)} />}
      <AvatarFallback className="bg-primary/10 font-medium text-primary">
        {initials(displayName(user))}
      </AvatarFallback>
    </Avatar>
  );
}
