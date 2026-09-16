import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { FormAlert } from "@/components/common/form-alert";
import { DueDatePicker } from "@/components/tasks/task-fields";
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  useCompleteSprint,
  useCreateSprint,
  useUpdateSprint,
} from "@/features/sprints/hooks";
import { dueDateKey, toDateKey } from "@/lib/due-date";
import type { Sprint } from "@/types/models";

// ---------- Create / edit ----------

interface SprintFormDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sprint?: Sprint;
}

export function SprintFormDialog({
  open,
  onOpenChange,
  ...props
}: SprintFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <SprintForm {...props} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function SprintForm({
  projectId,
  sprint,
  onDone,
}: Omit<SprintFormDialogProps, "open" | "onOpenChange"> & {
  onDone: () => void;
}) {
  const createSprint = useCreateSprint(projectId);
  const updateSprint = useUpdateSprint(projectId);
  const mutation = sprint ? updateSprint : createSprint;

  const defaultEnd = new Date();
  defaultEnd.setDate(defaultEnd.getDate() + 14);

  const [name, setName] = useState(sprint?.name ?? "");
  const [goal, setGoal] = useState(sprint?.goal ?? "");
  const [startDate, setStartDate] = useState(
    dueDateKey(sprint?.startDate) ?? (sprint ? "" : toDateKey(new Date())),
  );
  const [endDate, setEndDate] = useState(
    dueDateKey(sprint?.endDate) ?? (sprint ? "" : toDateKey(defaultEnd)),
  );
  const dateError =
    startDate && endDate && endDate < startDate
      ? "The end date must be on or after the start date"
      : null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (dateError) return;
    const body = { name: name.trim(), goal: goal.trim(), startDate, endDate };
    if (sprint) {
      updateSprint.mutate(
        { sprintId: sprint._id, ...body },
        { onSuccess: onDone },
      );
    } else {
      createSprint.mutate(body, { onSuccess: onDone });
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>{sprint ? "Edit sprint" : "Create sprint"}</DialogTitle>
        <DialogDescription>
          Plan a time-boxed iteration. Leave the name empty to number it
          automatically.
        </DialogDescription>
      </DialogHeader>

      <FieldGroup className="py-6">
        <Field>
          <FieldLabel htmlFor="sprint-name">Name</FieldLabel>
          <Input
            id="sprint-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sprint 4"
            maxLength={80}
            autoFocus
          />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2 sm:gap-3">
          <Field>
            <FieldLabel htmlFor="sprint-start">Start date</FieldLabel>
            <DueDatePicker
              id="sprint-start"
              value={startDate}
              onChange={setStartDate}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="sprint-end">End date</FieldLabel>
            <DueDatePicker
              id="sprint-end"
              value={endDate}
              onChange={setEndDate}
            />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="sprint-goal">
            Goal{" "}
            <span className="font-normal text-muted-foreground">
              (optional)
            </span>
          </FieldLabel>
          <Textarea
            id="sprint-goal"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="What should this sprint achieve?"
          />
        </Field>
        <FormAlert message={dateError ?? mutation.error?.message} />
      </FieldGroup>

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={mutation.isPending || !!dateError}>
          {mutation.isPending && <Spinner />}
          {sprint ? "Save sprint" : "Create sprint"}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ---------- Complete ----------

interface CompleteSprintDialogProps {
  projectId: string;
  sprint: Sprint | null;
  plannedSprints: Sprint[];
  onOpenChange: (open: boolean) => void;
}

export function CompleteSprintDialog({
  projectId,
  sprint,
  plannedSprints,
  onOpenChange,
}: CompleteSprintDialogProps) {
  const completeSprint = useCompleteSprint(projectId);
  const [target, setTarget] = useState("backlog");

  if (!sprint) return null;
  const openCount = sprint.taskCount - sprint.doneCount;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Complete {sprint.name}</DialogTitle>
          <DialogDescription>
            {sprint.doneCount} of {sprint.taskCount} tasks are done.
          </DialogDescription>
        </DialogHeader>

        {openCount > 0 ? (
          <Field className="py-4">
            <FieldLabel htmlFor="complete-target">
              Move {openCount} open {openCount === 1 ? "task" : "tasks"} to
            </FieldLabel>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger id="complete-target" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="backlog">Backlog</SelectItem>
                {plannedSprints.map((planned) => (
                  <SelectItem key={planned._id} value={planned._id}>
                    {planned.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : (
          <p className="py-4 text-sm text-muted-foreground">
            Every task is done. Nice work! 🎉
          </p>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            disabled={completeSprint.isPending}
            onClick={() =>
              completeSprint.mutate(
                { sprintId: sprint._id, moveOpenTo: target },
                {
                  onSuccess: ({ doneCount, movedCount }) => {
                    toast.success(`${sprint.name} completed`, {
                      description: `${doneCount} done${movedCount ? ` · ${movedCount} moved` : ""}`,
                    });
                    onOpenChange(false);
                  },
                },
              )
            }
          >
            {completeSprint.isPending && <Spinner />}
            Complete sprint
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
