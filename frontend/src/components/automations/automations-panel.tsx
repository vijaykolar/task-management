import {
  CheckCircle2Icon,
  CircleSlashIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  TriangleAlertIcon,
  WandSparklesIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

import { RuleDialog } from "@/components/automations/rule-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  useAutomationRules,
  useAutomationRuns,
  useDeleteRule,
  useRunRule,
  useToggleRule,
} from "@/features/automations/hooks";
import {
  useMemberOptions,
  useProjectWorkflow,
} from "@/features/projects/hooks";
import { useSprints } from "@/features/sprints/hooks";
import { ruleSentence, type AutomationNames } from "@/lib/automation-text";
import { formatRelative } from "@/lib/format";
import type { AutomationRule, UserRole } from "@/types/models";

const RUN_ICONS = {
  applied: CheckCircle2Icon,
  skipped: CircleSlashIcon,
  failed: TriangleAlertIcon,
} as const;

export function AutomationsPanel({
  projectId,
  role,
}: {
  projectId: string;
  role: UserRole | undefined;
}) {
  const canEdit = role === "admin" || role === "project_admin";
  const [editing, setEditing] = useState<AutomationRule | undefined>();
  const [open, setOpen] = useState(false);

  const { data: rules, isPending } = useAutomationRules(projectId);
  const { data: runs } = useAutomationRuns(projectId);
  const toggle = useToggleRule(projectId);
  const remove = useDeleteRule(projectId);
  const run = useRunRule(projectId);

  const { all: statuses } = useProjectWorkflow(projectId);
  const { data: members } = useMemberOptions(projectId);
  const { data: sprintData } = useSprints(projectId);

  // Rules store ids; the list reads better with names
  const names: AutomationNames = useMemo(
    () => ({
      status: (key) =>
        statuses.find((status) => status.key === key)?.name ?? key,
      user: (id) => {
        const person = members?.items.find((entry) => entry.user._id === id);
        return person
          ? person.user.fullName || person.user.username
          : "someone";
      },
      sprint: (id) =>
        sprintData?.sprints.find((sprint) => sprint._id === id)?.name ??
        "a sprint",
    }),
    [statuses, members, sprintData],
  );

  const startNew = () => {
    setEditing(undefined);
    setOpen(true);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <WandSparklesIcon className="size-4" />
            Automation
          </CardTitle>
          <CardDescription>
            Rules that act on tasks by themselves. They post in the app and
            never send email.
          </CardDescription>
          {canEdit && (
            <CardAction>
              <Button size="sm" onClick={startNew}>
                <PlusIcon className="size-4" />
                New rule
              </Button>
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {isPending && <Skeleton className="h-20 w-full" />}

          {!isPending && rules?.length === 0 && (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No rules yet</EmptyTitle>
                <EmptyDescription>
                  {canEdit
                    ? "Try: when the status becomes Done, unassign the task and add the label shipped."
                    : "A project admin can add rules here."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}

          {rules?.map((rule) => (
            <div
              key={rule._id}
              className="flex items-start gap-3 rounded-lg border p-3"
            >
              <Switch
                checked={rule.enabled}
                disabled={!canEdit || toggle.isPending}
                onCheckedChange={(enabled) =>
                  toggle.mutate({ ruleId: rule._id, enabled })
                }
                aria-label={rule.enabled ? "Disable rule" : "Enable rule"}
              />
              <div className="min-w-0 flex-1">
                <p
                  className={
                    rule.enabled
                      ? "text-sm font-medium"
                      : "text-sm font-medium text-muted-foreground"
                  }
                >
                  {rule.name}
                </p>
                <p className="text-sm text-muted-foreground">
                  {ruleSentence(rule, names)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {rule.runCount > 0
                    ? `Ran ${rule.runCount} ${rule.runCount === 1 ? "time" : "times"}${
                        rule.lastRunAt
                          ? `, last ${formatRelative(rule.lastRunAt)}`
                          : ""
                      }`
                    : "Hasn't run yet"}
                </p>
              </div>
              {canEdit && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost" className="size-8">
                      <MoreHorizontalIcon className="size-4" />
                      <span className="sr-only">Rule actions</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={() => {
                        setEditing(rule);
                        setOpen(true);
                      }}
                    >
                      <PencilIcon className="size-4" />
                      Edit
                    </DropdownMenuItem>
                    {rule.trigger.event === "schedule" && (
                      <DropdownMenuItem onSelect={() => run.mutate(rule._id)}>
                        <PlayIcon className="size-4" />
                        Run now
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => remove.mutate(rule._id)}
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
          <CardDescription>
            Why a task changed on its own, and why a rule didn't fire.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {runs?.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing yet.</p>
          )}
          {runs?.map((entry) => {
            const Icon = RUN_ICONS[entry.status];
            return (
              <div key={entry._id} className="flex gap-2 text-sm">
                <Icon
                  className={
                    entry.status === "applied"
                      ? "mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-500"
                      : entry.status === "failed"
                        ? "mt-0.5 size-4 shrink-0 text-destructive"
                        : "mt-0.5 size-4 shrink-0 text-muted-foreground"
                  }
                />
                <div className="min-w-0">
                  <p className="truncate font-medium">{entry.ruleName}</p>
                  <p className="text-muted-foreground">
                    {entry.taskKey && (
                      <Badge variant="outline" className="mr-1 font-mono">
                        {entry.taskKey}
                      </Badge>
                    )}
                    {entry.error ?? entry.details.join(", ")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatRelative(entry.createdAt)}
                  </p>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {canEdit && (
        <RuleDialog
          projectId={projectId}
          rule={editing}
          open={open}
          onOpenChange={setOpen}
        />
      )}
    </div>
  );
}
