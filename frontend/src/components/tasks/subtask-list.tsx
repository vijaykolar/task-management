import {
  CheckIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import {
  useCreateSubtask,
  useDeleteSubtask,
  useUpdateSubtask,
} from "@/features/tasks/hooks";
import { subtaskTitleSchema } from "@/features/tasks/schemas";
import { displayName } from "@/lib/format";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import type { Subtask, UserRole } from "@/types/models";

interface SubtaskListProps {
  projectId: string;
  taskId: string;
  subtasks: Subtask[];
  role: UserRole | undefined;
}

export function SubtaskList({
  projectId,
  taskId,
  subtasks,
  role,
}: SubtaskListProps) {
  const canManage = can(role, "subtask:manage");
  const canToggle = can(role, "subtask:toggle");

  const createSubtask = useCreateSubtask(projectId, taskId);
  const updateSubtask = useUpdateSubtask(projectId, taskId);
  const deleteSubtask = useDeleteSubtask(projectId, taskId);

  const [newTitle, setNewTitle] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(
    null,
  );

  const completed = subtasks.filter((s) => s.isCompleted).length;
  const percent = subtasks.length
    ? Math.round((completed / subtasks.length) * 100)
    : 0;

  const handleAdd = (event: FormEvent) => {
    event.preventDefault();
    const parsed = subtaskTitleSchema.safeParse(newTitle);
    if (!parsed.success) {
      setAddError(parsed.error.issues[0]?.message ?? "Invalid title");
      return;
    }
    createSubtask.mutate(parsed.data, {
      onSuccess: () => {
        setNewTitle("");
        setAddError(null);
      },
      onError: (error) => setAddError(error.message),
    });
  };

  const handleRename = (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    const parsed = subtaskTitleSchema.safeParse(editing.title);
    if (!parsed.success) return;
    updateSubtask.mutate(
      { subtaskId: editing.id, title: parsed.data },
      { onSuccess: () => setEditing(null) },
    );
  };

  return (
    <div className="space-y-3">
      {subtasks.length > 0 && (
        <div className="flex items-center gap-3">
          <Progress value={percent} className="h-1.5" />
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {completed}/{subtasks.length} · {percent}%
          </span>
        </div>
      )}

      {subtasks.length === 0 && !canManage && (
        <p className="text-sm text-muted-foreground">No subtasks.</p>
      )}

      <ul className="space-y-1">
        {subtasks.map((subtask) => {
          const isEditing = editing?.id === subtask._id;
          const checkboxId = `subtask-${subtask._id}`;

          return (
            <li
              key={subtask._id}
              className="group/subtask flex min-h-9 items-center gap-3 rounded-md px-2 py-1 hover:bg-muted/50"
            >
              <Checkbox
                id={checkboxId}
                checked={subtask.isCompleted}
                disabled={!canToggle || isEditing}
                onCheckedChange={(checked) =>
                  updateSubtask.mutate({
                    subtaskId: subtask._id,
                    isCompleted: checked === true,
                  })
                }
              />

              {isEditing ? (
                <form onSubmit={handleRename} className="flex flex-1 gap-1">
                  <InputGroup className="h-7">
                    <InputGroupInput
                      value={editing.title}
                      onChange={(e) =>
                        setEditing({ id: subtask._id, title: e.target.value })
                      }
                      onKeyDown={(e) => e.key === "Escape" && setEditing(null)}
                      aria-label="Subtask title"
                      autoFocus
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupButton
                        type="submit"
                        size="icon-xs"
                        aria-label="Save"
                        disabled={updateSubtask.isPending}
                      >
                        <CheckIcon />
                      </InputGroupButton>
                      <InputGroupButton
                        size="icon-xs"
                        aria-label="Cancel"
                        onClick={() => setEditing(null)}
                      >
                        <XIcon />
                      </InputGroupButton>
                    </InputGroupAddon>
                  </InputGroup>
                </form>
              ) : (
                <label
                  htmlFor={checkboxId}
                  className={cn(
                    "min-w-0 flex-1 cursor-pointer text-sm wrap-break-word",
                    subtask.isCompleted && "text-muted-foreground line-through",
                    !canToggle && "cursor-default",
                  )}
                  title={
                    subtask.createdBy
                      ? `Added by ${displayName(subtask.createdBy)}`
                      : undefined
                  }
                >
                  {subtask.title}
                </label>
              )}

              {canManage && !isEditing && (
                <div className="flex gap-0.5 opacity-0 group-hover/subtask:opacity-100 focus-within:opacity-100 max-md:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() =>
                      setEditing({ id: subtask._id, title: subtask.title })
                    }
                    aria-label={`Rename ${subtask.title}`}
                  >
                    <PencilIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="hover:text-destructive"
                    onClick={() => deleteSubtask.mutate(subtask._id)}
                    disabled={
                      deleteSubtask.isPending &&
                      deleteSubtask.variables === subtask._id
                    }
                    aria-label={`Delete ${subtask.title}`}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {canManage && (
        <form onSubmit={handleAdd} className="space-y-1.5">
          <InputGroup>
            <InputGroupAddon>
              <PlusIcon />
            </InputGroupAddon>
            <InputGroupInput
              value={newTitle}
              onChange={(e) => {
                setNewTitle(e.target.value);
                setAddError(null);
              }}
              placeholder="Add a subtask…"
              aria-label="New subtask title"
              aria-invalid={!!addError}
              disabled={createSubtask.isPending}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                type="submit"
                size="xs"
                variant="secondary"
                disabled={createSubtask.isPending || !newTitle.trim()}
              >
                {createSubtask.isPending && <Spinner />}
                Add
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          {addError && <p className="text-sm text-destructive">{addError}</p>}
        </form>
      )}
    </div>
  );
}
