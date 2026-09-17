import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { FormAlert } from "@/components/common/form-alert";
import { RichTextEditor } from "@/components/rich-text/lazy-rich-text-editor";
import {
  useImageUploads,
  useMentionItems,
} from "@/components/rich-text/use-rich-text-helpers";
import { AssigneeSelect } from "@/components/tasks/assignee-select";
import { FilePicker } from "@/components/tasks/file-picker";
import {
  DueDatePicker,
  LabelsInput,
  PrioritySelect,
  StoryPointsInput,
} from "@/components/tasks/task-fields";
import { TaskStatusSelect } from "@/components/tasks/task-status-badge";
import { EpicSelect, TaskTypeSelect } from "@/components/tasks/task-type";
import { SprintSelect } from "@/components/sprints/sprint-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useCreateTask, useUpdateTask } from "@/features/tasks/hooks";
import {
  taskSchema,
  validateFiles,
  type TaskValues,
} from "@/features/tasks/schemas";
import { applyServerFieldErrors } from "@/lib/form-errors";
import type {
  TaskPriority,
  TaskRef,
  TaskStatus,
  TaskType,
  UserSummary,
} from "@/types/models";
import { dueDateKey } from "@/lib/due-date";

export interface EditableTask {
  _id: string;
  key?: string;
  type: TaskType;
  title: string;
  description?: string;
  status: TaskStatus;
  epic?: TaskRef;
  priority: TaskPriority;
  dueDate?: string;
  startDate?: string;
  labels: string[];
  storyPoints?: number;
  sprint?: string;
  assignedTo?: Pick<UserSummary, "_id">;
  attachmentCount: number;
}

interface TaskFormDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pass a task to edit it; omit to create */
  task?: EditableTask;
  defaultStatus?: TaskStatus;
  /** Pre-selected sprint for new tasks ("" = backlog) */
  defaultSprint?: string;
  onCreated?: (taskId: string) => void;
}

export function TaskFormDialog({
  open,
  onOpenChange,
  ...props
}: TaskFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90svh] overflow-y-auto sm:max-w-2xl"
        // The @mention popup lives outside the dialog; using it must not
        // close the dialog
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
        {/* Mounted only while open, so form + mutation state start fresh */}
        <TaskForm {...props} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function TaskForm({
  projectId,
  task,
  defaultStatus = "todo",
  defaultSprint,
  onCreated,
  onDone,
}: Omit<TaskFormDialogProps, "open" | "onOpenChange"> & {
  onDone: () => void;
}) {
  const isEdit = !!task;
  const createTask = useCreateTask(projectId);
  const updateTask = useUpdateTask(projectId);
  const mutation = isEdit ? updateTask : createTask;
  const [files, setFiles] = useState<File[]>([]);
  const mentionItems = useMentionItems(projectId);
  const images = useImageUploads(projectId);

  const form = useForm<TaskValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: task?.title ?? "",
      description: task?.description ?? "",
      status: task?.status ?? defaultStatus,
      type: task?.type ?? "task",
      epic: task?.epic?._id ?? "",
      assignedTo: task?.assignedTo?._id ?? "",
      priority: task?.priority ?? "medium",
      dueDate: dueDateKey(task?.dueDate) ?? "",
      startDate: dueDateKey(task?.startDate) ?? "",
      labels: task?.labels ?? [],
      storyPoints: task?.storyPoints?.toString() ?? "",
      sprint: task?.sprint ?? defaultSprint ?? "",
    },
  });

  const type = useWatch({ control: form.control, name: "type" });
  const isEpic = type === "epic";
  const existingCount = task?.attachmentCount ?? 0;
  const filesError = validateFiles(files, existingCount);

  const onSubmit = form.handleSubmit(({ storyPoints: pointsText, ...rest }) => {
    if (filesError || images.uploading > 0) return;
    const values = {
      ...rest,
      // Epics sit above sprints and can't have an epic themselves
      epic: rest.type === "epic" ? "" : rest.epic,
      sprint: rest.type === "epic" ? "" : rest.sprint,
      storyPoints: pointsText.trim() ? Number(pointsText) : ("" as const),
    };
    const onError = (error: unknown) =>
      applyServerFieldErrors(error, form.setError, [
        "title",
        "description",
        "status",
        "type",
        "epic",
        "assignedTo",
        "priority",
        "dueDate",
        "startDate",
        "labels",
        "storyPoints",
      ]);

    if (task) {
      updateTask.mutate(
        { taskId: task._id, ...values, files },
        {
          onSuccess: () => {
            toast.success("Task updated");
            onDone();
          },
          onError,
        },
      );
    } else {
      createTask.mutate(
        { ...values, files },
        {
          onSuccess: (created) => {
            onDone();
            onCreated?.(created._id);
          },
          onError,
        },
      );
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <DialogHeader>
        <DialogTitle>
          {isEdit ? `Edit ${task.key ?? "task"}` : "New task"}
        </DialogTitle>
        <DialogDescription>
          {isEdit
            ? "Update the task details, assignee or add more files."
            : "Describe the work and assign it to a teammate."}
        </DialogDescription>
      </DialogHeader>

      <FieldGroup className="py-6">
        <Controller
          control={form.control}
          name="title"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="task-title">Title</FieldLabel>
              <Input
                {...field}
                id="task-title"
                placeholder="e.g. Design the landing page"
                aria-invalid={fieldState.invalid}
                autoFocus
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />

        <Controller
          control={form.control}
          name="description"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="task-description">Description</FieldLabel>
              <RichTextEditor
                id="task-description"
                aria-label="Description"
                value={field.value}
                onChange={field.onChange}
                placeholder="Add context, acceptance criteria, links… Type @ to mention someone or paste a screenshot"
                invalid={fieldState.invalid}
                mentionItems={mentionItems}
                {...images.editorProps}
                contentClassName="max-h-72 min-h-28 overflow-y-auto"
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />

        <div className="grid gap-5 sm:grid-cols-2 sm:gap-3">
          <Controller
            control={form.control}
            name="type"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="task-type">Type</FieldLabel>
                <TaskTypeSelect
                  id="task-type"
                  value={field.value}
                  onValueChange={field.onChange}
                  className="w-full"
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          {!isEpic && (
            <Controller
              control={form.control}
              name="epic"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="task-epic">Epic</FieldLabel>
                  <EpicSelect
                    id="task-epic"
                    projectId={projectId}
                    excludeId={task?._id}
                    value={field.value}
                    onValueChange={field.onChange}
                    className="w-full"
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
          )}
        </div>

        <div className="grid gap-5 sm:grid-cols-2 sm:gap-3">
          <Controller
            control={form.control}
            name="status"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="task-status">Status</FieldLabel>
                <TaskStatusSelect
                  projectId={projectId}
                  id="task-status"
                  value={field.value}
                  onValueChange={field.onChange}
                  className="w-full"
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name="assignedTo"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="task-assignee">Assignee</FieldLabel>
                <AssigneeSelect
                  id="task-assignee"
                  projectId={projectId}
                  value={field.value}
                  onValueChange={field.onChange}
                  aria-invalid={fieldState.invalid}
                  className="w-full"
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2 sm:gap-3">
          <Controller
            control={form.control}
            name="priority"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="task-priority">Priority</FieldLabel>
                <PrioritySelect
                  id="task-priority"
                  value={field.value}
                  onValueChange={field.onChange}
                  className="w-full"
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name="startDate"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="task-start-date">Start date</FieldLabel>
                <DueDatePicker
                  id="task-start-date"
                  value={field.value}
                  onChange={field.onChange}
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name="dueDate"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="task-due-date">Due date</FieldLabel>
                <DueDatePicker
                  id="task-due-date"
                  value={field.value}
                  onChange={field.onChange}
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
        </div>

        <div
          className={
            isEpic
              ? "grid gap-5 sm:w-36"
              : "grid gap-5 sm:grid-cols-[1fr_9rem] sm:gap-3"
          }
        >
          {!isEpic && (
            <Controller
              control={form.control}
              name="sprint"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="task-sprint">Sprint</FieldLabel>
                  <SprintSelect
                    id="task-sprint"
                    projectId={projectId}
                    value={field.value}
                    onValueChange={field.onChange}
                    className="w-full"
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
          )}
          <Controller
            control={form.control}
            name="storyPoints"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="task-story-points">
                  Story points
                </FieldLabel>
                <StoryPointsInput
                  id="task-story-points"
                  value={field.value}
                  onChange={field.onChange}
                  invalid={fieldState.invalid}
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
        </div>

        <Controller
          control={form.control}
          name="labels"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="task-labels">
                Labels
                <span className="font-normal text-muted-foreground">
                  (Enter or comma to add)
                </span>
              </FieldLabel>
              <LabelsInput
                id="task-labels"
                projectId={projectId}
                value={field.value}
                onChange={field.onChange}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />

        <Field>
          <FieldLabel>
            {isEdit ? "Add attachments" : "Attachments"}
            <span className="font-normal text-muted-foreground">
              (optional)
            </span>
          </FieldLabel>
          <FilePicker
            files={files}
            onChange={setFiles}
            existingCount={existingCount}
            disabled={mutation.isPending}
          />
        </Field>

        <FormAlert
          message={
            // Update errors already get a global toast
            !isEdit && createTask.error?.statusCode !== 422
              ? createTask.error?.message
              : null
          }
        />
      </FieldGroup>

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button
          type="submit"
          disabled={mutation.isPending || !!filesError || images.uploading > 0}
        >
          {(mutation.isPending || images.uploading > 0) && <Spinner />}
          {images.uploading > 0
            ? "Uploading image…"
            : isEdit
              ? "Save changes"
              : "Create task"}
        </Button>
      </DialogFooter>
    </form>
  );
}
