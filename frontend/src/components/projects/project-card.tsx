import {
  CalendarIcon,
  EllipsisIcon,
  ExternalLinkIcon,
  PencilIcon,
  Trash2Icon,
  UsersIcon,
} from "lucide-react";
import { Link } from "react-router";

import { RoleBadge } from "@/components/common/role-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelative } from "@/lib/format";
import { can } from "@/lib/permissions";
import { projectColor } from "@/lib/project-color";
import { cn } from "@/lib/utils";
import type { ProjectListItem } from "@/types/models";

interface ProjectCardProps {
  item: ProjectListItem;
  onEdit: () => void;
  onDelete: () => void;
}

export function ProjectCard({ item, onEdit, onDelete }: ProjectCardProps) {
  const { project, role } = item;
  const to = `/projects/${project._id}`;
  const canEdit = can(role, "project:update");
  const canDelete = can(role, "project:delete");

  return (
    <Card className="group/project relative transition-shadow hover:shadow-md">
      <CardHeader>
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-white",
              projectColor(project._id),
            )}
          >
            {project.name.charAt(0).toUpperCase()}
          </span>
          <CardTitle className="min-w-0 truncate">
            {/* Stretched link makes the whole card clickable */}
            <Link
              to={to}
              className="after:absolute after:inset-0 after:rounded-[inherit] focus-visible:outline-none"
            >
              {project.name}
            </Link>
          </CardTitle>
        </div>
        <CardAction className="relative z-10">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Actions for ${project.name}`}
              >
                <EllipsisIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link to={to}>
                  <ExternalLinkIcon />
                  Open
                </Link>
              </DropdownMenuItem>
              {canEdit && (
                <DropdownMenuItem onSelect={onEdit}>
                  <PencilIcon />
                  Edit
                </DropdownMenuItem>
              )}
              {canDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                    <Trash2Icon />
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </CardAction>
      </CardHeader>

      <CardContent className="flex-1">
        <CardDescription className="line-clamp-2 min-h-10">
          {project.description || (
            <span className="italic">No description</span>
          )}
        </CardDescription>
      </CardContent>

      <CardFooter className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <RoleBadge role={role} />
          {item.isOwner && (
            <Badge variant="secondary" className="h-5">
              Owner
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1" title="Members">
            <UsersIcon className="size-3.5" />
            {project.members}
          </span>
          <span className="flex items-center gap-1" title="Created">
            <CalendarIcon className="size-3.5" />
            {formatRelative(project.createdAt)}
          </span>
        </div>
      </CardFooter>
    </Card>
  );
}

export function ProjectCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-lg" />
          <Skeleton className="h-4 w-32" />
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-2/3" />
      </CardContent>
      <CardFooter className="justify-between">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-3.5 w-24" />
      </CardFooter>
    </Card>
  );
}
