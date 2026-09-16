import {
  CircleCheckIcon,
  CircleDashedIcon,
  CircleDotIcon,
  type LucideIcon,
} from "lucide-react";

import type { TaskStatus } from "@/types/models";

export const taskStatusMeta: Record<
  TaskStatus,
  { label: string; icon: LucideIcon; className: string; dotClassName: string }
> = {
  todo: {
    label: "To do",
    icon: CircleDashedIcon,
    className:
      "border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300",
    dotClassName: "bg-slate-400",
  },
  in_progress: {
    label: "In progress",
    icon: CircleDotIcon,
    className: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
    dotClassName: "bg-sky-500",
  },
  done: {
    label: "Done",
    icon: CircleCheckIcon,
    className:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    dotClassName: "bg-emerald-500",
  },
};
