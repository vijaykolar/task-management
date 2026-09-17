import {
  BookmarkIcon,
  BugIcon,
  SquareCheckIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";

import type { TaskType } from "@/types/models";

export const taskTypeMeta: Record<
  TaskType,
  { label: string; icon: LucideIcon; className: string }
> = {
  task: {
    label: "Task",
    icon: SquareCheckIcon,
    className: "text-sky-600 dark:text-sky-400",
  },
  story: {
    label: "Story",
    icon: BookmarkIcon,
    className: "text-emerald-600 dark:text-emerald-400",
  },
  bug: {
    label: "Bug",
    icon: BugIcon,
    className: "text-red-600 dark:text-red-400",
  },
  epic: {
    label: "Epic",
    icon: ZapIcon,
    className: "text-violet-600 dark:text-violet-400",
  },
};
