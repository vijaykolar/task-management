import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowRightIcon,
  GripVerticalIcon,
  PlusIcon,
  Trash2Icon,
  WorkflowIcon,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useUpdateWorkflow } from "@/features/projects/hooks";
import { statusCategoryMeta } from "@/lib/task-status";
import { cn } from "@/lib/utils";
import {
  AvailableStatusCategories,
  type ProjectDetail,
  type ProjectStatus,
  type StatusCategory,
} from "@/types/models";

// Mirrors backend/src/utils/constants.ts
const MAX_STATUSES = 12;

interface DraftStatus {
  /** Local id for sorting; new statuses have no key yet */
  id: string;
  key?: string;
  name: string;
  category: StatusCategory;
}

const toDraft = (statuses: ProjectStatus[]): DraftStatus[] =>
  statuses
    .filter((status) => !status.archived)
    .map((status) => ({
      id: status.key,
      key: status.key,
      name: status.name,
      category: status.category,
    }));

/**
 * Edits the project's board columns: rename, reorder (drag or keyboard),
 * change category, add and remove. Tasks in removed statuses move to a
 * status the admin picks.
 */
export function WorkflowSettings({
  project,
  canEdit,
}: {
  project: ProjectDetail;
  canEdit: boolean;
}) {
  const updateWorkflow = useUpdateWorkflow(project._id);
  const [draft, setDraft] = useState(() => toDraft(project.statuses));
  const [moves, setMoves] = useState<Record<string, string>>({});
  const [newCount, setNewCount] = useState(0);

  const saved = toDraft(project.statuses);
  const removed = saved.filter(
    (status) => !draft.some((item) => item.key === status.key),
  );
  const isDirty =
    JSON.stringify(
      draft.map(({ key, name, category }) => ({ key, name, category })),
    ) !==
    JSON.stringify(
      saved.map(({ key, name, category }) => ({ key, name, category })),
    );

  const names = draft.map((status) => status.name.trim().toLowerCase());
  const problems = [
    draft.some((status) => !status.name.trim()) && "Every status needs a name.",
    new Set(names).size !== names.length && "Status names must be unique.",
    !draft.some((status) => status.category === "todo") &&
      "Keep at least one status in the To do category.",
    !draft.some((status) => status.category === "done") &&
      "Keep at least one status in the Done category.",
  ].filter(Boolean) as string[];

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setDraft((items) =>
      arrayMove(
        items,
        items.findIndex((item) => item.id === active.id),
        items.findIndex((item) => item.id === over.id),
      ),
    );
  };

  const update = (id: string, changes: Partial<DraftStatus>) =>
    setDraft((items) =>
      items.map((item) => (item.id === id ? { ...item, ...changes } : item)),
    );

  // New statuses go before the Done statuses, where in-progress work belongs
  const addStatus = () => {
    setNewCount((count) => count + 1);
    setDraft((items) => {
      const firstDone = items.findIndex((item) => item.category === "done");
      const index = firstDone === -1 ? items.length : firstDone;
      return [
        ...items.slice(0, index),
        { id: `new-${newCount}`, name: "", category: "in_progress" },
        ...items.slice(index),
      ];
    });
  };

  // A removed status' tasks default to the first remaining status of its category
  const moveTarget = (status: DraftStatus) =>
    moves[status.key!] ??
    draft.find((item) => item.key && item.category === status.category)?.key ??
    draft.find((item) => item.key)?.key ??
    "";

  const save = () =>
    updateWorkflow.mutate(
      {
        statuses: draft.map(({ key, name, category }) => ({
          key,
          name: name.trim(),
          category,
        })),
        moves: Object.fromEntries(
          removed
            .map((status) => [status.key!, moveTarget(status)] as const)
            .filter(([, target]) => target),
        ),
      },
      {
        onSuccess: (statuses) => {
          setDraft(toDraft(statuses));
          setMoves({});
        },
      },
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <WorkflowIcon className="size-4" />
          Workflow
        </CardTitle>
        <CardDescription>
          The statuses tasks move through, in board order. Each belongs to a
          category; reports count anything in a Done category as finished.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={draft.map((status) => status.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="space-y-2">
              {draft.map((status) => (
                <SortableStatusRow
                  key={status.id}
                  status={status}
                  canEdit={canEdit}
                  canRemove={draft.length > 1}
                  onChange={(changes) => update(status.id, changes)}
                  onRemove={() =>
                    setDraft((items) =>
                      items.filter((item) => item.id !== status.id),
                    )
                  }
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>

        {canEdit && draft.length < MAX_STATUSES && (
          <Button variant="outline" size="sm" onClick={addStatus}>
            <PlusIcon />
            Add status
          </Button>
        )}

        {removed.length > 0 && (
          <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            <p className="text-sm font-medium">Removed statuses</p>
            <p className="text-sm text-muted-foreground">
              Tasks in these statuses will move when you save.
            </p>
            {removed.map((status) => (
              <div
                key={status.key}
                className="flex flex-wrap items-center gap-2 text-sm"
              >
                <span className="font-medium line-through">{status.name}</span>
                <ArrowRightIcon className="size-4 text-muted-foreground" />
                <Select
                  value={moveTarget(status)}
                  onValueChange={(value) =>
                    setMoves((current) => ({
                      ...current,
                      [status.key!]: value,
                    }))
                  }
                >
                  <SelectTrigger
                    size="sm"
                    className="w-48"
                    aria-label={`Move tasks from ${status.name} to`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {/* New statuses get their key on save, so they can't be targets yet */}
                    {draft
                      .filter((item) => item.key)
                      .map((item) => (
                        <SelectItem key={item.key} value={item.key!}>
                          {item.name || "Untitled"}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        )}

        {isDirty && problems.length > 0 && (
          <ul className="space-y-1 text-sm text-destructive">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        )}
      </CardContent>
      {canEdit && (
        <CardFooter className="gap-2 border-t">
          <Button
            onClick={save}
            disabled={
              !isDirty || problems.length > 0 || updateWorkflow.isPending
            }
          >
            {updateWorkflow.isPending && <Spinner />}
            Save workflow
          </Button>
          {isDirty && (
            <Button
              variant="ghost"
              onClick={() => {
                setDraft(saved);
                setMoves({});
              }}
              disabled={updateWorkflow.isPending}
            >
              Discard changes
            </Button>
          )}
        </CardFooter>
      )}
    </Card>
  );
}

function SortableStatusRow({
  status,
  canEdit,
  canRemove,
  onChange,
  onRemove,
}: {
  status: DraftStatus;
  canEdit: boolean;
  canRemove: boolean;
  onChange: (changes: Partial<DraftStatus>) => void;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: status.id, disabled: !canEdit });
  const meta = statusCategoryMeta[status.category];

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2 rounded-lg border bg-card p-2",
        isDragging && "relative z-10 shadow-md",
      )}
    >
      {canEdit && (
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          className="cursor-grab rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing"
          aria-label={`Reorder ${status.name || "new status"}`}
        >
          <GripVerticalIcon className="size-4" />
        </button>
      )}
      <span
        className={cn("size-2.5 shrink-0 rounded-full", meta.dotClassName)}
      />
      <Input
        value={status.name}
        maxLength={30}
        placeholder="Status name"
        onChange={(event) => onChange({ name: event.target.value })}
        disabled={!canEdit}
        aria-label="Status name"
        className="h-8 min-w-0 flex-1"
        autoFocus={!status.key && !status.name}
      />
      <Select
        value={status.category}
        onValueChange={(value) =>
          onChange({ category: value as StatusCategory })
        }
        disabled={!canEdit}
      >
        <SelectTrigger size="sm" className="w-36" aria-label="Category">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          {AvailableStatusCategories.map((category) => {
            const {
              icon: Icon,
              iconClassName,
              label,
            } = statusCategoryMeta[category];
            return (
              <SelectItem key={category} value={category}>
                <Icon className={iconClassName} />
                {label}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      {canEdit && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          disabled={!canRemove}
          aria-label={`Remove ${status.name || "status"}`}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2Icon />
        </Button>
      )}
    </li>
  );
}
