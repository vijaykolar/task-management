import {
  CalendarIcon,
  CalendarClockIcon,
  ClockIcon,
  FlagIcon,
  TagIcon,
  ZapIcon,
  HistoryIcon,
  MessageSquareIcon,
  PaperclipIcon,
  PencilIcon,
  SquareCheckBigIcon,
  Trash2Icon,
  UploadIcon,
  UserRoundIcon,
  UserRoundPenIcon,
  type LucideIcon,
} from "lucide-react";
import { useRef, type ReactNode } from "react";
import { toast } from "sonner";

import { QueryError } from "@/components/common/query-error";
import { UserAvatar } from "@/components/common/user-avatar";
import { AttachmentList } from "@/components/tasks/attachment-list";
import { SubtaskList } from "@/components/tasks/subtask-list";
import { SprintSelect } from "@/components/sprints/sprint-select";
import { TaskActivityList } from "@/components/tasks/task-activity";
import { TaskComments } from "@/components/tasks/task-comments";
import {
  DueDateBadge,
  DueDatePicker,
  LabelList,
  LabelsInput,
  PriorityIcon,
  PrioritySelect,
} from "@/components/tasks/task-fields";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { dueDateKey } from "@/lib/due-date";
import { taskPriorityMeta } from "@/lib/task-priority";
import {
  TaskStatusBadge,
  TaskStatusSelect,
} from "@/components/tasks/task-status-badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  useDeleteAttachment,
  useTask,
  useUpdateTask,
} from "@/features/tasks/hooks";
import {
  ACCEPTED_FILE_TYPES,
  MAX_ATTACHMENTS_PER_TASK,
  validateFiles,
} from "@/features/tasks/schemas";
import { displayName, formatDate, formatRelative } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { TaskDetail, UserRole, UserSummary } from "@/types/models";

interface TaskDetailSheetProps {
  projectId: string;
  taskId: string | null;
  role: UserRole | undefined;
  onClose: () => void;
  onEdit: (task: TaskDetail) => void;
  onDelete: (task: TaskDetail) => void;
}

export function TaskDetailSheet({
  taskId,
  onClose,
  ...props
}: TaskDetailSheetProps) {
  return (
    <Sheet open={!!taskId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        className="w-full gap-0 overflow-y-auto sm:max-w-xl"
        // The @mention popup lives outside the sheet; interacting with it or
        // pressing Escape to close it must not close the sheet
        onInteractOutside={(event) => {
          if (
            (event.target as HTMLElement | null)?.closest?.(
              "[data-floating-popup]",
            )
          ) {
            event.preventDefault();
          }
        }}
        onEscapeKeyDown={(event) => {
          if (document.querySelector("[data-floating-popup]")) {
            event.preventDefault();
          }
        }}
      >
        {taskId && <TaskDetailContent taskId={taskId} {...props} />}
      </SheetContent>
    </Sheet>
  );
}

function Section({
  icon: Icon,
  title,
  action,
  children,
}: {
  icon: LucideIcon;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 border-t px-6 py-5">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-medium">{title}</h3>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </section>
  );
}

function Person({ user }: { user?: UserSummary }) {
  if (!user) {
    return <span className="text-muted-foreground">Unassigned</span>;
  }
  return (
    <span className="flex min-w-0 items-center gap-2">
      <UserAvatar user={user} size="sm" />
      <span className="truncate">{displayName(user)}</span>
    </span>
  );
}

function TaskDetailContent({
  projectId,
  taskId,
  role,
  onEdit,
  onDelete,
}: Omit<TaskDetailSheetProps, "taskId" | "onClose"> & { taskId: string }) {
  const task = useTask(projectId, taskId);
  const updateTask = useUpdateTask(projectId);
  const deleteAttachment = useDeleteAttachment(projectId, taskId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canManage = can(role, "task:manage");

  if (task.isPending) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-7 w-3/4" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (task.isError) {
    return (
      <div className="p-6">
        <SheetHeader className="sr-only">
          <SheetTitle>Task</SheetTitle>
        </SheetHeader>
        <QueryError
          title={
            task.error.statusCode === 404
              ? "Task not found"
              : "Couldn't load task"
          }
          error={task.error}
          onRetry={
            task.error.statusCode === 404 ? undefined : () => task.refetch()
          }
          isRetrying={task.isRefetching}
        />
      </div>
    );
  }

  const data = task.data;
  // Placeholder comes from the board card and lacks subtasks/attachments
  const isPartial = task.isPlaceholderData;

  const uploadFiles = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    const error = validateFiles(files, data.attachments.length);
    if (error) {
      toast.error(error);
      return;
    }
    updateTask.mutate(
      { taskId, files },
      {
        onSuccess: () =>
          toast.success(
            files.length === 1
              ? "File uploaded"
              : `${files.length} files uploaded`,
          ),
      },
    );
  };

  return (
    <>
      <SheetHeader className="gap-3 p-6 pr-12">
        <TaskStatusBadge status={data.status} />
        <SheetTitle className="text-xl leading-snug wrap-break-word">
          {data.title}
        </SheetTitle>
        <SheetDescription className="sr-only">Task details</SheetDescription>

        {canManage && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <TaskStatusSelect
              value={data.status}
              onValueChange={(status) => updateTask.mutate({ taskId, status })}
              size="sm"
              className="w-36"
              aria-label="Change status"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEdit(data)}
              disabled={isPartial}
            >
              <PencilIcon />
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => onDelete(data)}
            >
              <Trash2Icon />
              Delete
            </Button>
          </div>
        )}
      </SheetHeader>

      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-6 gap-y-3 border-t px-6 py-5 text-sm">
        <dt className="flex items-center gap-2 text-muted-foreground">
          <UserRoundIcon className="size-4" />
          Assignee
        </dt>
        <dd className="min-w-0">
          <Person user={data.assignedTo} />
        </dd>

        <dt className="flex items-center gap-2 text-muted-foreground">
          <FlagIcon className="size-4" />
          Priority
        </dt>
        <dd className="min-w-0">
          {canManage ? (
            <PrioritySelect
              size="sm"
              className="w-36"
              value={data.priority}
              onValueChange={(priority) =>
                updateTask.mutate({ taskId, priority })
              }
            />
          ) : (
            <span className="flex items-center gap-1.5">
              <PriorityIcon priority={data.priority} />
              {taskPriorityMeta[data.priority].label}
            </span>
          )}
        </dd>

        <dt className="flex items-center gap-2 text-muted-foreground">
          <CalendarClockIcon className="size-4" />
          Due date
        </dt>
        <dd className="min-w-0">
          {canManage ? (
            <DueDatePicker
              size="sm"
              className="w-44"
              value={dueDateKey(data.dueDate) ?? ""}
              onChange={(dueDate) => updateTask.mutate({ taskId, dueDate })}
            />
          ) : data.dueDate ? (
            <DueDateBadge
              dueDate={data.dueDate}
              done={data.status === "done"}
            />
          ) : (
            <span className="text-muted-foreground">None</span>
          )}
        </dd>

        <dt className="flex items-center gap-2 text-muted-foreground">
          <ZapIcon className="size-4" />
          Sprint
        </dt>
        <dd className="min-w-0">
          <SprintSelect
            projectId={projectId}
            size="sm"
            className="w-44"
            value={data.sprint ?? ""}
            disabled={!canManage}
            onValueChange={(sprint) => updateTask.mutate({ taskId, sprint })}
          />
        </dd>

        <dt className="flex items-center gap-2 self-start pt-1.5 text-muted-foreground">
          <TagIcon className="size-4" />
          Labels
        </dt>
        <dd className="min-w-0">
          {canManage ? (
            <LabelsInput
              projectId={projectId}
              value={data.labels}
              onChange={(labels) => updateTask.mutate({ taskId, labels })}
            />
          ) : data.labels.length > 0 ? (
            <LabelList labels={data.labels} />
          ) : (
            <span className="text-muted-foreground">None</span>
          )}
        </dd>

        <dt className="flex items-center gap-2 text-muted-foreground">
          <UserRoundPenIcon className="size-4" />
          Created by
        </dt>
        <dd className="min-w-0">
          {isPartial ? (
            <Skeleton className="h-6 w-28" />
          ) : data.assignedBy ? (
            <Person user={data.assignedBy} />
          ) : (
            "—"
          )}
        </dd>

        <dt className="flex items-center gap-2 text-muted-foreground">
          <CalendarIcon className="size-4" />
          Created
        </dt>
        <dd>{formatDate(data.createdAt)}</dd>

        <dt className="flex items-center gap-2 text-muted-foreground">
          <ClockIcon className="size-4" />
          Updated
        </dt>
        <dd>{formatRelative(data.updatedAt)}</dd>
      </dl>

      <section className="border-t px-6 py-5">
        {data.description ? (
          <p className="text-sm leading-relaxed wrap-break-word whitespace-pre-wrap">
            {data.description}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            No description provided.
          </p>
        )}
      </section>

      <Section icon={SquareCheckBigIcon} title="Subtasks">
        {isPartial ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (
          <SubtaskList
            projectId={projectId}
            taskId={taskId}
            subtasks={data.subtasks}
            role={role}
          />
        )}
      </Section>

      <Section
        icon={PaperclipIcon}
        title={
          isPartial
            ? "Attachments"
            : `Attachments (${data.attachments.length}/${MAX_ATTACHMENTS_PER_TASK})`
        }
        action={
          canManage && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPTED_FILE_TYPES}
                className="sr-only"
                onChange={(e) => {
                  uploadFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <Button
                variant="outline"
                size="xs"
                onClick={() => fileInputRef.current?.click()}
                disabled={
                  isPartial ||
                  updateTask.isPending ||
                  data.attachments.length >= MAX_ATTACHMENTS_PER_TASK
                }
              >
                {updateTask.isPending ? <Spinner /> : <UploadIcon />}
                Upload
              </Button>
            </>
          )
        }
      >
        {isPartial ? (
          <Skeleton className="h-14 w-full" />
        ) : data.attachments.length > 0 ? (
          <AttachmentList
            attachments={data.attachments}
            onRemove={
              canManage
                ? (file) => deleteAttachment.mutate(file._id)
                : undefined
            }
            removingId={
              deleteAttachment.isPending
                ? deleteAttachment.variables
                : undefined
            }
          />
        ) : (
          <p className="text-sm text-muted-foreground">No attachments.</p>
        )}
      </Section>

      {/* Jira-style Activity: comments and history */}
      <section className="space-y-3 border-t px-6 py-5">
        <h3 className="text-sm font-medium">Activity</h3>
        <Tabs defaultValue="comments" className="gap-4">
          <TabsList>
            <TabsTrigger value="comments">
              <MessageSquareIcon />
              Comments
            </TabsTrigger>
            <TabsTrigger value="history">
              <HistoryIcon />
              History
            </TabsTrigger>
          </TabsList>
          <TabsContent value="comments">
            <TaskComments projectId={projectId} taskId={taskId} role={role} />
          </TabsContent>
          <TabsContent value="history">
            <TaskActivityList projectId={projectId} taskId={taskId} />
          </TabsContent>
        </Tabs>
      </section>
    </>
  );
}
