import { ListPlusIcon, XIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

import { TaskPicker } from "@/components/tasks/task-links";
import { TaskKey } from "@/components/tasks/task-type";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useCorrectSprintReport } from "@/features/sprints/hooks";
import { cn } from "@/lib/utils";
import type { CorrectionTask, SprintReport, TaskRef } from "@/types/models";

const fromRef = (task: TaskRef): CorrectionTask => ({
  _id: task._id,
  key: task.key,
  title: task.title,
  deleted: false,
  storyPoints: null,
  done: false,
});

function TaskList({
  projectId,
  title,
  description,
  tasks,
  onChange,
  showDone,
  extraAction,
}: {
  projectId: string;
  title: string;
  description: string;
  tasks: CorrectionTask[];
  onChange: (tasks: CorrectionTask[]) => void;
  showDone?: boolean;
  extraAction?: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium">
            {title}{" "}
            <span className="font-normal text-muted-foreground tabular-nums">
              ({tasks.length})
            </span>
          </h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        {extraAction}
      </div>

      <ul className="max-h-56 divide-y overflow-y-auto rounded-lg border">
        {tasks.length === 0 && (
          <li className="px-3 py-3 text-sm text-muted-foreground">
            No tasks. Add them below.
          </li>
        )}
        {tasks.map((task) => (
          <li
            key={task._id}
            className="flex items-center gap-2 px-3 py-2 text-sm"
          >
            <TaskKey value={task.key} className="w-16" />
            <span
              className={cn(
                "min-w-0 flex-1 truncate",
                task.deleted && "text-muted-foreground line-through",
              )}
              title={task.deleted ? "This task was deleted" : task.title}
            >
              {task.title}
            </span>
            {task.storyPoints !== null && (
              <span className="text-xs text-muted-foreground tabular-nums">
                {task.storyPoints} pts
              </span>
            )}
            {showDone && (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Checkbox
                  checked={task.done}
                  onCheckedChange={(checked) =>
                    onChange(
                      tasks.map((item) =>
                        item._id === task._id
                          ? { ...item, done: checked === true }
                          : item,
                      ),
                    )
                  }
                  aria-label={`${task.key ?? task.title} was done`}
                />
                Done
              </label>
            )}
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground"
              aria-label={`Remove ${task.key ?? task.title}`}
              onClick={() =>
                onChange(tasks.filter((item) => item._id !== task._id))
              }
            >
              <XIcon />
            </Button>
          </li>
        ))}
      </ul>

      <TaskPicker
        projectId={projectId}
        value={null}
        excludeIds={tasks.map((task) => task._id)}
        onChange={(task) => onChange([...tasks, fromRef(task)])}
      />
    </section>
  );
}

/**
 * Lets an admin correct a sprint from before reports existed: which tasks
 * were committed, and which were still in the sprint at the end (and done).
 * Saving marks the report confirmed, so it's no longer shown as approximate.
 */
export function CorrectReportDialog({
  projectId,
  report,
  open,
  onOpenChange,
}: {
  projectId: string;
  report: SprintReport;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl">
        {open && report.correction && (
          <CorrectReportForm
            projectId={projectId}
            report={report}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CorrectReportForm({
  projectId,
  report,
  onDone,
}: {
  projectId: string;
  report: SprintReport;
  onDone: () => void;
}) {
  const correction = report.correction!;
  const isCompleted = report.sprint.status === "completed";
  const save = useCorrectSprintReport(projectId, report.sprint._id);
  const [committed, setCommitted] = useState(correction.committed);
  const [atEnd, setAtEnd] = useState(correction.atEnd ?? []);

  const missingFromEnd = committed.filter(
    (task) => !atEnd.some((item) => item._id === task._id),
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle>Correct “{report.sprint.name}” report</DialogTitle>
        <DialogDescription>
          This sprint predates report tracking, so these lists were rebuilt from
          task history. Tasks that were moved out when the sprint was completed
          weren&apos;t recorded, so check the lists against what actually
          happened. Saving confirms the report.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-6 py-5">
        <TaskList
          projectId={projectId}
          title="Committed when the sprint started"
          description="Tasks planned into the sprint on day one. Anything added later counts as scope added."
          tasks={committed}
          onChange={setCommitted}
        />

        {isCompleted && (
          <TaskList
            projectId={projectId}
            title="In the sprint when it ended"
            description="Tick the ones that were done. Unticked tasks count as carried over; tasks missing here count as removed."
            tasks={atEnd}
            onChange={setAtEnd}
            showDone
            extraAction={
              missingFromEnd.length > 0 && (
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => setAtEnd([...atEnd, ...missingFromEnd])}
                >
                  <ListPlusIcon />
                  Add committed tasks ({missingFromEnd.length})
                </Button>
              )
            }
          />
        )}
      </div>

      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Cancel</Button>
        </DialogClose>
        <Button
          disabled={save.isPending}
          onClick={() =>
            save.mutate(
              {
                committed: committed.map((task) => ({ task: task._id })),
                ...(isCompleted && {
                  atEnd: atEnd.map((task) => ({
                    task: task._id,
                    done: task.done,
                  })),
                }),
              },
              { onSuccess: onDone },
            )
          }
        >
          {save.isPending && <Spinner />}
          Save and confirm
        </Button>
      </DialogFooter>
    </>
  );
}
