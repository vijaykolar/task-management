import {
  CheckCircle2Icon,
  FolderKanbanIcon,
  ShieldCheckIcon,
  UsersIcon,
} from "lucide-react";
import { Link, Outlet } from "react-router";

import { ThemeToggle } from "@/components/layout/theme-toggle";

const highlights = [
  {
    icon: FolderKanbanIcon,
    title: "Organize every project",
    text: "Keep projects, descriptions and ownership in one place.",
  },
  {
    icon: UsersIcon,
    title: "Collaborate with your team",
    text: "Invite teammates by email and give them the right role.",
  },
  {
    icon: ShieldCheckIcon,
    title: "Role-based access",
    text: "Admins, project admins and members each see what they need.",
  },
];

export function AuthLayout() {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col p-6 md:p-10">
        <div className="flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2 font-heading font-semibold"
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <FolderKanbanIcon className="size-4" />
            </span>
            Project Camp
          </Link>
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">
            <Outlet />
          </div>
        </div>
        <p className="text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Project Camp
        </p>
      </div>

      <div className="relative hidden overflow-hidden bg-muted lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,color-mix(in_oklch,var(--primary)_18%,transparent),transparent_55%),radial-gradient(circle_at_80%_80%,color-mix(in_oklch,var(--chart-2)_25%,transparent),transparent_50%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] mask-[radial-gradient(ellipse_at_center,black_20%,transparent_75%)] bg-size-[48px_48px] opacity-60" />

        <div className="relative flex h-full flex-col justify-center gap-10 p-16">
          <div className="space-y-3">
            <h2 className="font-heading text-4xl font-semibold tracking-tight text-balance">
              Ship projects together, without the chaos.
            </h2>
            <p className="max-w-md text-muted-foreground">
              A focused workspace for teams to plan projects and manage who does
              what.
            </p>
          </div>

          <ul className="space-y-5">
            {highlights.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-background/70 shadow-xs backdrop-blur">
                  <Icon className="size-5" />
                </span>
                <div>
                  <p className="font-medium">{title}</p>
                  <p className="text-sm text-muted-foreground">{text}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2Icon className="size-4 text-emerald-600" />
            Secure JWT sessions with email verification
          </div>
        </div>
      </div>
    </div>
  );
}

export function AuthHeading({
  title,
  description,
}: {
  title: string;
  description: React.ReactNode;
}) {
  return (
    <div className="mb-8 space-y-2 text-center">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">
        {title}
      </h1>
      <p className="text-sm text-balance text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
