import {
  BanIcon,
  CalendarClockIcon,
  CalendarIcon,
  ClockIcon,
  FlagIcon,
  GaugeIcon,
  HistoryIcon,
  LinkIcon,
  Link2Icon,
  MessageSquareIcon,
  PaperclipIcon,
  PencilIcon,
  PlusIcon,
  ShapesIcon,
  SquareCheckBigIcon,
  TagIcon,
  Trash2Icon,
  UploadIcon,
  UserRoundIcon,
  UserRoundPenIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { QueryError } from "@/components/common/query-error";
import { UserAvatar } from "@/components/common/user-avatar";
import { SprintSelect } from "@/components/sprints/sprint-select";
import { AssigneeSelect } from "@/components/tasks/assignee-select";
import { AttachmentList } from "@/components/tasks/attachment-list";
import { SubtaskList } from "@/components/tasks/subtask-list";
import { TaskActivityList } from "@/components/tasks/task-activity";
import { TaskComments } from "@/components/tasks/task-comments";
import { TaskDescription } from "@/components/tasks/task-description";
import {
  DueDateBadge,
  DueDatePicker,
  LabelList,
  LabelsInput,
  PriorityIcon,
  PrioritySelect,
  StoryPointsInput,
} from "@/components/tasks/task-fields";
import { TaskLinks, TaskPicker } from "@/components/tasks/task-links";
import { TaskWatchers } from "@/components/tasks/task-watchers";
import {
  TaskStatusBadge,
  TaskStatusSelect,
} from "@/components/tasks/task-status-badge";
import {
  EpicSelect,
  TaskKey,
  TaskTypeIcon,
  TaskTypeSelect,
} from "@/components/tasks/task-type";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useDeleteAttachment,
  useTask,
  useTaskPage,
  useUpdateTask,
} from "@/features/tasks/hooks";
import {
  ACCEPTED_FILE_TYPES,
  MAX_ATTACHMENTS_PER_TASK,
  validateFiles,
} from "@/features/tasks/schemas";
import { dueDateKey } from "@/lib/due-date";
import { displayName, formatDate, formatRelative } from "@/lib/format";
import { can } from "@/lib/permissions";
import { formatPoints, parsePoints } from "@/lib/story-points";
import { taskPriorityMeta } from "@/lib/task-priority";
import { taskTypeMeta } from "@/lib/task-type";
import { cn } from "@/lib/utils";
import type { TaskDetail, UserRole, UserSummary } from "@/types/models";

interface TaskDetailDialogProps {
  projectId: string;
  taskId: string | null;
  role: UserRole | undefined;
  onClose: () => void;
  /** Opens another task (linked task, child issue) in place of this one */
  onOpenTask: (taskId: string) => void;
  onEdit: (task: TaskDetail) => void;
  onDelete: (task: TaskDetail) => void;
}

/** Jira-style issue view: content on the left, fields on the right */
export function TaskDetailDialog({
  taskId,
  onClose,
  ...props
}: TaskDetailDialogProps) {
  return (
    <Dialog open={!!taskId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="flex max-h-[92svh] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl"
        // The @mention popup lives outside the dialog; interacting with it or
        // pressing Escape to close it must not close the dialog
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
        {taskId && (
          // Keyed so switching tasks resets inline editors and scroll
          <TaskDetailContent key={taskId} taskId={taskId} {...props} />
        )}
      </DialogContent>
    </Dialog>
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
    <section className="space-y-3">
      <div className="flex min-h-7 items-center gap-2">
        <Icon className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-medium">{title}</h3>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </section>
  );
}

function FieldRow({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
}) {
  return (
    <>
      <dt className="flex h-8 items-center gap-2 text-muted-foreground">
        <Icon className="size-4" />
        {label}
      </dt>
      <dd className="flex min-h-8 min-w-0 items-center">{children}</dd>
    </>
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

/** Saves on blur or Enter; invalid input reverts to the saved value */
function InlineStoryPoints({
  value,
  onSave,
}: {
  value?: number;
  onSave: (points: number | null) => void;
}) {
  const [draft, setDraft] = useState(value?.toString() ?? "");

  const commit = () => {
    const points = parsePoints(draft);
    if (points === undefined) {
      toast.error("Story points must be a number from 0 to 1000");
      setDraft(value?.toString() ?? "");
      return;
    }
    if (points !== (value ?? null)) onSave(points);
  };

  return (
    <StoryPointsInput
      value={draft}
      onChange={setDraft}
      onCommit={commit}
      className="h-7 w-24"
    />
  );
}

function TaskDetailContent({
  projectId,
  taskId,
  role,
  onOpenTask,
  onEdit,
  onDelete,
}: Omit<TaskDetailDialogProps, "taskId" | "onClose"> & { taskId: string }) {
  const task = useTask(projectId, taskId);
  const updateTask = useUpdateTask(projectId);
  const deleteAttachment = useDeleteAttachment(projectId, taskId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canManage = can(role, "task:manage");

  if (task.isPending) {
    return (
      <div className="space-y-4 p-6">
        <DialogTitle className="sr-only">Loading task</DialogTitle>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-7 w-3/4" />
        <div className="grid gap-6 md:grid-cols-[1fr_18rem]">
          <Skeleton className="h-60 w-full" />
          <Skeleton className="h-60 w-full" />
        </div>
      </div>
    );
  }

  if (task.isError) {
    return (
      <div className="p-6">
        <DialogTitle className="sr-only">Task</DialogTitle>
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
  const isEpic = data.type === "epic";
  const isDone = data.statusCategory === "done";

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

  const copyLink = async () => {
    const url = `${window.location.origin}/browse/${data.key}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(`Link to ${data.key} copied`);
    } catch {
      toast.error("Couldn't copy the link");
    }
  };

  return (
    <>
      {/* Top bar: where this task sits, and actions */}
      <div className="flex items-center gap-2 border-b py-2.5 pr-12 pl-6 text-sm">
        {data.epic && (
          <>
            <button
              type="button"
              className="flex min-w-0 items-center gap-1 text-muted-foreground hover:text-foreground"
              onClick={() => onOpenTask(data.epic!._id)}
              title={data.epic.title}
            >
              <ZapIcon className="size-3.5 text-violet-600 dark:text-violet-400" />
              <span className="font-mono text-xs">{data.epic.key}</span>
            </button>
            <span className="text-muted-foreground">/</span>
          </>
        )}
        <TaskTypeIcon type={data.type} />
        <TaskKey value={data.key} className="text-sm" />
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={copyLink}
          aria-label="Copy link"
          title="Copy link"
        >
          <LinkIcon />
        </Button>

        <div className="ml-auto flex items-center gap-1">
          {!isPartial && (
            <TaskWatchers
              projectId={projectId}
              taskId={taskId}
              watchers={data.watchers ?? []}
            />
          )}
          {canManage && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onEdit(data)}
                disabled={isPartial}
              >
                <PencilIcon />
                <span className="max-sm:sr-only">Edit</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => onDelete(data)}
              >
                <Trash2Icon />
                <span className="max-sm:sr-only">Delete</span>
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[minmax(0,1fr)_19rem] md:overflow-hidden">
        {/* Main content */}
        <div className="space-y-6 p-6 md:overflow-y-auto">
          <div className="space-y-2">
            <DialogTitle
              className={cn(
                "text-xl leading-snug font-semibold wrap-break-word",
                isDone && "text-muted-foreground",
              )}
            >
              {data.title}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {taskTypeMeta[data.type].label} {data.key}
            </DialogDescription>
            {data.blockedByCount > 0 && (
              <p className="flex items-center gap-1.5 text-sm text-red-700 dark:text-red-400">
                <BanIcon className="size-4" />
                Blocked by {data.blockedByCount} unfinished{" "}
                {data.blockedByCount === 1 ? "task" : "tasks"}
              </p>
            )}
          </div>

          {isPartial ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <TaskDescription
              projectId={projectId}
              taskId={taskId}
              description={data.description}
              canEdit={canManage}
            />
          )}

          {isEpic && (
            <EpicChildren
              projectId={projectId}
              epicId={taskId}
              canManage={canManage}
              onOpenTask={onOpenTask}
            />
          )}

          {!isEpic && (
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
          )}

          <Section icon={Link2Icon} title="Linked tasks">
            <TaskLinks
              projectId={projectId}
              task={data}
              canManage={canManage}
              onOpenTask={onOpenTask}
            />
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
          <section className="space-y-3">
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
                <TaskComments
                  projectId={projectId}
                  taskId={taskId}
                  role={role}
                />
              </TabsContent>
              <TabsContent value="history">
                <TaskActivityList projectId={projectId} taskId={taskId} />
              </TabsContent>
            </Tabs>
          </section>
        </div>

        {/* Fields */}
        <aside className="space-y-4 border-t bg-muted/20 p-6 md:overflow-y-auto md:border-t-0 md:border-l">
          {canManage ? (
            <TaskStatusSelect
              projectId={projectId}
              value={data.status}
              onValueChange={(status) => updateTask.mutate({ taskId, status })}
              className="w-full"
              aria-label="Status"
            />
          ) : (
            <TaskStatusBadge status={data.status} projectId={projectId} />
          )}

          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
            <FieldRow icon={UserRoundIcon} label="Assignee">
              {canManage ? (
                <AssigneeSelect
                  projectId={projectId}
                  value={data.assignedTo?._id ?? ""}
                  onValueChange={(assignedTo) =>
                    updateTask.mutate({ taskId, assignedTo })
                  }
                  className="h-8 w-full"
                  aria-label="Assignee"
                />
              ) : (
                <Person user={data.assignedTo} />
              )}
            </FieldRow>

            <FieldRow icon={ShapesIcon} label="Type">
              {canManage ? (
                <TaskTypeSelect
                  size="sm"
                  className="w-full"
                  value={data.type}
                  onValueChange={(type) => updateTask.mutate({ taskId, type })}
                  // Epics can't sit in a sprint
                  allowEpic={!data.sprint}
                />
              ) : (
                <span className="flex items-center gap-1.5">
                  <TaskTypeIcon type={data.type} />
                  {taskTypeMeta[data.type].label}
                </span>
              )}
            </FieldRow>

            <FieldRow icon={FlagIcon} label="Priority">
              {canManage ? (
                <PrioritySelect
                  size="sm"
                  className="w-full"
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
            </FieldRow>

            {!isEpic && (
              <FieldRow icon={ZapIcon} label="Epic">
                {canManage ? (
                  <EpicSelect
                    projectId={projectId}
                    size="sm"
                    className="w-full"
                    value={data.epic?._id ?? ""}
                    onValueChange={(epic) =>
                      updateTask.mutate({ taskId, epic })
                    }
                  />
                ) : data.epic ? (
                  <button
                    type="button"
                    className="truncate text-left hover:underline"
                    onClick={() => onOpenTask(data.epic!._id)}
                  >
                    {data.epic.title}
                  </button>
                ) : (
                  <span className="text-muted-foreground">None</span>
                )}
              </FieldRow>
            )}

            <FieldRow icon={GaugeIcon} label="Points">
              {canManage ? (
                <InlineStoryPoints
                  // Reset the draft when the saved value changes
                  key={data.storyPoints ?? "none"}
                  value={data.storyPoints}
                  onSave={(storyPoints) =>
                    updateTask.mutate({
                      taskId,
                      storyPoints: storyPoints ?? "",
                    })
                  }
                />
              ) : data.storyPoints !== undefined ? (
                <span className="tabular-nums">
                  {formatPoints(data.storyPoints)}
                </span>
              ) : (
                <span className="text-muted-foreground">None</span>
              )}
            </FieldRow>

            <FieldRow icon={CalendarClockIcon} label="Due date">
              {canManage ? (
                <DueDatePicker
                  size="sm"
                  className="w-full"
                  value={dueDateKey(data.dueDate) ?? ""}
                  onChange={(dueDate) => updateTask.mutate({ taskId, dueDate })}
                />
              ) : data.dueDate ? (
                <DueDateBadge dueDate={data.dueDate} done={isDone} />
              ) : (
                <span className="text-muted-foreground">None</span>
              )}
            </FieldRow>

            {!isEpic && (
              <FieldRow icon={ZapIcon} label="Sprint">
                <SprintSelect
                  projectId={projectId}
                  size="sm"
                  className="w-full"
                  value={data.sprint ?? ""}
                  disabled={!canManage}
                  onValueChange={(sprint) =>
                    updateTask.mutate({ taskId, sprint })
                  }
                />
              </FieldRow>
            )}
          </dl>

          <div className="space-y-2 text-sm">
            <p className="flex items-center gap-2 text-muted-foreground">
              <TagIcon className="size-4" />
              Labels
            </p>
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
          </div>

          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 border-t pt-4 text-sm">
            <FieldRow icon={UserRoundPenIcon} label="Reporter">
              {isPartial ? (
                <Skeleton className="h-6 w-28" />
              ) : data.assignedBy ? (
                <Person user={data.assignedBy} />
              ) : (
                "—"
              )}
            </FieldRow>
            <FieldRow icon={CalendarIcon} label="Created">
              {formatDate(data.createdAt)}
            </FieldRow>
            <FieldRow icon={ClockIcon} label="Updated">
              {formatRelative(data.updatedAt)}
            </FieldRow>
          </dl>
        </aside>
      </div>
    </>
  );
}

/** Child issues of an epic, with progress and a way to add existing tasks */
function EpicChildren({
  projectId,
  epicId,
  canManage,
  onOpenTask,
}: {
  projectId: string;
  epicId: string;
  canManage: boolean;
  onOpenTask: (taskId: string) => void;
}) {
  const children = useTaskPage(projectId, {
    epic: epicId,
    sort: "key",
    order: "asc",
    limit: 100,
  });
  const updateTask = useUpdateTask(projectId);
  const [adding, setAdding] = useState(false);

  const items = children.data?.items ?? [];
  const done = items.filter((item) => item.statusCategory === "done").length;
  const percent = items.length ? Math.round((done / items.length) * 100) : 0;

  return (
    <Section
      icon={ZapIcon}
      title="Child issues"
      action={
        canManage &&
        !adding && (
          <Button variant="outline" size="xs" onClick={() => setAdding(true)}>
            <PlusIcon />
            Add task
          </Button>
        )
      }
    >
      {items.length > 0 && (
        <div className="flex items-center gap-3">
          <Progress value={percent} className="h-2" />
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {done}/{items.length} done
          </span>
        </div>
      )}

      {adding && (
        <div className="flex gap-2">
          <TaskPicker
            projectId={projectId}
            value={null}
            excludeIds={[epicId, ...items.map((item) => item._id)]}
            onChange={(task) =>
              updateTask.mutate(
                { taskId: task._id, epic: epicId },
                {
                  onSuccess: () => {
                    toast.success(`${task.key} added to the epic`);
                    setAdding(false);
                  },
                },
              )
            }
          />
          <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
            Cancel
          </Button>
        </div>
      )}

      {children.isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No tasks in this epic yet.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {items.map((item) => (
            <li
              key={item._id}
              className="flex items-center gap-2 px-3 py-2 text-sm"
            >
              <TaskTypeIcon type={item.type} />
              <TaskKey
                value={item.key}
                className={cn(item.statusCategory === "done" && "line-through")}
              />
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left hover:underline"
                onClick={() => onOpenTask(item._id)}
              >
                {item.title}
              </button>
              {item.assignedTo && (
                <UserAvatar user={item.assignedTo} size="sm" />
              )}
              <TaskStatusBadge
                status={item.status}
                projectId={projectId}
                className="hidden sm:inline-flex"
              />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
