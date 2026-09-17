import {
  ChevronDownIcon,
  FlagIcon,
  InboxIcon,
  ShapesIcon,
  Trash2Icon,
  UserRoundIcon,
  UserRoundXIcon,
  XIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { UserAvatar } from "@/components/common/user-avatar";
import { PriorityIcon } from "@/components/tasks/task-fields";
import { TaskTypeIcon } from "@/components/tasks/task-type";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import {
  useMemberOptions,
  useProjectWorkflow,
} from "@/features/projects/hooks";
import { useSprints } from "@/features/sprints/hooks";
import type { BulkChanges } from "@/features/tasks/api";
import { useBulkDeleteTasks, useBulkUpdateTasks } from "@/features/tasks/hooks";
import { displayName } from "@/lib/format";
import { statusCategoryMeta } from "@/lib/task-status";
import { taskPriorityMeta } from "@/lib/task-priority";
import { taskTypeMeta } from "@/lib/task-type";
import {
  AvailableTaskPriorities,
  AvailableTaskTypes,
  type BulkResult,
} from "@/types/models";

/** Reports how a bulk action went, naming tasks that couldn't be changed */
function reportResult(result: BulkResult, verb: string) {
  const noun = (count: number) => (count === 1 ? "task" : "tasks");
  if (result.failed.length === 0) {
    toast.success(`${result.updated} ${noun(result.updated)} ${verb}`);
    return;
  }
  toast.warning(
    `${result.updated} ${noun(result.updated)} ${verb}, ${result.failed.length} skipped`,
    {
      description: result.failed
        .slice(0, 3)
        .map((failure) => `${failure.key ?? "Task"}: ${failure.message}`)
        .join("\n"),
    },
  );
}

function ActionMenu({
  icon: Icon,
  label,
  disabled,
  children,
}: {
  icon: LucideIcon;
  label: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <Icon />
          {label}
          <ChevronDownIcon className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-72 w-56 overflow-y-auto"
      >
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Actions for the tasks selected in the list view */
export function BulkActionBar({
  projectId,
  selectedIds,
  onClear,
}: {
  projectId: string;
  selectedIds: string[];
  onClear: () => void;
}) {
  const workflow = useProjectWorkflow(projectId);
  const members = useMemberOptions(projectId);
  const sprints = useSprints(projectId);
  const bulkUpdate = useBulkUpdateTasks(projectId);
  const bulkDelete = useBulkDeleteTasks(projectId);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const count = selectedIds.length;
  const busy = bulkUpdate.isPending || bulkDelete.isPending;
  const openSprints =
    sprints.data?.sprints.filter((sprint) => sprint.status !== "completed") ??
    [];

  const apply = (changes: BulkChanges) =>
    bulkUpdate.mutate(
      { taskIds: selectedIds, changes },
      { onSuccess: (result) => reportResult(result, "updated") },
    );

  return (
    <div
      role="toolbar"
      aria-label="Bulk actions"
      className="sticky bottom-4 z-20 flex flex-wrap items-center gap-2 rounded-xl border bg-popover p-2 shadow-lg"
    >
      <span className="px-2 text-sm font-medium tabular-nums">
        {count} selected
      </span>

      <ActionMenu
        icon={statusCategoryMeta.in_progress.icon}
        label="Status"
        disabled={busy}
      >
        {workflow.statuses.map((status) => {
          const { icon: Icon, iconClassName } =
            statusCategoryMeta[status.category];
          return (
            <DropdownMenuItem
              key={status.key}
              onSelect={() => apply({ status: status.key })}
            >
              <Icon className={iconClassName} />
              {status.name}
            </DropdownMenuItem>
          );
        })}
      </ActionMenu>

      <ActionMenu icon={UserRoundIcon} label="Assignee" disabled={busy}>
        <DropdownMenuItem onSelect={() => apply({ assignedTo: "" })}>
          <UserRoundXIcon />
          Unassigned
        </DropdownMenuItem>
        {members.data?.items.map(({ user }) => (
          <DropdownMenuItem
            key={user._id}
            onSelect={() => apply({ assignedTo: user._id })}
          >
            <UserAvatar user={user} size="sm" />
            {displayName(user)}
          </DropdownMenuItem>
        ))}
      </ActionMenu>

      <ActionMenu icon={FlagIcon} label="Priority" disabled={busy}>
        {[...AvailableTaskPriorities].reverse().map((priority) => (
          <DropdownMenuItem key={priority} onSelect={() => apply({ priority })}>
            <PriorityIcon priority={priority} />
            {taskPriorityMeta[priority].label}
          </DropdownMenuItem>
        ))}
      </ActionMenu>

      <ActionMenu icon={ZapIcon} label="Sprint" disabled={busy}>
        <DropdownMenuItem onSelect={() => apply({ sprint: "" })}>
          <InboxIcon />
          Backlog
        </DropdownMenuItem>
        {openSprints.map((sprint) => (
          <DropdownMenuItem
            key={sprint._id}
            onSelect={() => apply({ sprint: sprint._id })}
          >
            <ZapIcon />
            {sprint.name}
          </DropdownMenuItem>
        ))}
      </ActionMenu>

      <ActionMenu icon={ShapesIcon} label="Type" disabled={busy}>
        {AvailableTaskTypes.map((type) => (
          <DropdownMenuItem key={type} onSelect={() => apply({ type })}>
            <TaskTypeIcon type={type} />
            {taskTypeMeta[type].label}
          </DropdownMenuItem>
        ))}
      </ActionMenu>

      <Button
        variant="ghost"
        size="sm"
        className="text-destructive hover:text-destructive"
        onClick={() => setConfirmDelete(true)}
        disabled={busy}
      >
        <Trash2Icon />
        Delete
      </Button>

      {busy && <Spinner className="size-4 text-muted-foreground" />}
      <Button
        variant="ghost"
        size="icon-sm"
        className="ml-auto"
        onClick={onClear}
        aria-label="Clear selection"
      >
        <XIcon />
      </Button>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {count} {count === 1 ? "task" : "tasks"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They will be permanently deleted with their subtasks, links and
              attachments.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDelete.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={bulkDelete.isPending}
              onClick={(event) => {
                event.preventDefault();
                bulkDelete.mutate(selectedIds, {
                  onSuccess: (result) => {
                    reportResult(result, "deleted");
                    setConfirmDelete(false);
                    onClear();
                  },
                });
              }}
            >
              {bulkDelete.isPending && <Spinner />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
