import {
  CircleCheckIcon,
  CircleDashedIcon,
  CircleDotIcon,
  type LucideIcon,
} from "lucide-react";

import type { ProjectStatus, StatusCategory, TaskStatus } from "@/types/models";

/** Look of a status, which comes from its category */
export const statusCategoryMeta: Record<
  StatusCategory,
  {
    label: string;
    icon: LucideIcon;
    className: string;
    iconClassName: string;
    dotClassName: string;
  }
> = {
  todo: {
    label: "To do",
    icon: CircleDashedIcon,
    className:
      "border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300",
    iconClassName: "text-slate-500",
    dotClassName: "bg-slate-400",
  },
  in_progress: {
    label: "In progress",
    icon: CircleDotIcon,
    className: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
    iconClassName: "text-sky-500",
    dotClassName: "bg-sky-500",
  },
  done: {
    label: "Done",
    icon: CircleCheckIcon,
    className:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    iconClassName: "text-emerald-500",
    dotClassName: "bg-emerald-500",
  },
};

const LEGACY_CATEGORIES: Record<string, StatusCategory> = {
  todo: "todo",
  in_progress: "in_progress",
  done: "done",
};

/**
 * Name and category of a status key. Unknown keys (e.g. while the project's
 * workflow is still loading) fall back to a readable version of the key.
 */
export function describeStatus(
  statuses: ProjectStatus[] | undefined,
  key: TaskStatus,
): Pick<ProjectStatus, "name" | "category"> {
  const status = statuses?.find((candidate) => candidate.key === key);
  if (status) return status;
  const legacy = LEGACY_CATEGORIES[key];
  if (legacy)
    return { category: legacy, name: statusCategoryMeta[legacy].label };
  const words = key.replace(/_/g, " ");
  return {
    category: "todo",
    name: words.charAt(0).toUpperCase() + words.slice(1),
  };
}
