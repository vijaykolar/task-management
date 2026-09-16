import {
  ChevronDownIcon,
  ChevronsUpIcon,
  ChevronUpIcon,
  EqualIcon,
  type LucideIcon,
} from "lucide-react";

import type { TaskPriority } from "@/types/models";

export const taskPriorityMeta: Record<
  TaskPriority,
  { label: string; icon: LucideIcon; className: string }
> = {
  low: {
    label: "Low",
    icon: ChevronDownIcon,
    className: "text-sky-600 dark:text-sky-400",
  },
  medium: {
    label: "Medium",
    icon: EqualIcon,
    className: "text-amber-600 dark:text-amber-400",
  },
  high: {
    label: "High",
    icon: ChevronUpIcon,
    className: "text-orange-600 dark:text-orange-400",
  },
  urgent: {
    label: "Urgent",
    icon: ChevronsUpIcon,
    className: "text-red-600 dark:text-red-400",
  },
};
