import {
  ArrowDownIcon,
  ArrowUpIcon,
  CrownIcon,
  FolderKanbanIcon,
  PlusIcon,
  SearchIcon,
  UsersIcon,
} from "lucide-react";
import { useState } from "react";

import { PageHeader } from "@/components/common/page-header";
import { PaginationControls } from "@/components/common/pagination-controls";
import { QueryError } from "@/components/common/query-error";
import { DeleteProjectDialog } from "@/components/projects/delete-project-dialog";
import {
  ProjectCard,
  ProjectCardSkeleton,
} from "@/components/projects/project-card";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUser } from "@/features/auth/hooks";
import type { ProjectSort } from "@/features/projects/api";
import { useProjects } from "@/features/projects/hooks";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { displayName } from "@/lib/format";
import { roleLabels } from "@/lib/permissions";
import {
  AvailableUserRoles,
  type ProjectListItem,
  type SortOrder,
  type UserRole,
} from "@/types/models";

const PAGE_SIZE = 12;

const sortLabels: Record<ProjectSort, string> = {
  createdAt: "Date created",
  name: "Name",
  members: "Members",
};

function StatCard({
  icon: Icon,
  label,
  value,
  loading,
}: {
  icon: typeof FolderKanbanIcon;
  label: string;
  value: number;
  loading: boolean;
}) {
  return (
    <Card className="py-4">
      <CardContent className="flex items-center gap-4 px-4">
        <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          {loading ? (
            <Skeleton className="mt-1 h-6 w-8" />
          ) : (
            <p className="font-heading text-2xl font-semibold tabular-nums">
              {value}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function ProjectsPage() {
  const { data: user } = useCurrentUser();

  const [search, setSearch] = useState("");
  const [role, setRole] = useState<UserRole | "all">("all");
  const [sort, setSort] = useState<ProjectSort>("createdAt");
  const [order, setOrder] = useState<SortOrder>("desc");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search.trim());

  const projects = useProjects({
    page,
    limit: PAGE_SIZE,
    sort,
    order,
    search: debouncedSearch || undefined,
    role: role === "all" ? undefined : role,
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectListItem | null>(null);
  const [deleting, setDeleting] = useState<ProjectListItem | null>(null);

  // Any filter change starts again from the first page
  const withReset =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      setPage(1);
    };

  const stats = projects.data?.stats;
  const items = projects.data?.items ?? [];
  const isFiltering = debouncedSearch !== "" || role !== "all";
  // Deleting the last card on a page: step back to a page that still exists
  const lastPage = projects.data?.pagination.totalPages ?? 1;
  if (page > lastPage && !projects.isFetching) setPage(lastPage);

  return (
    <>
      <PageHeader
        title={user ? `Hi, ${displayName(user)} 👋` : "Projects"}
        description="Here are all the projects you have access to."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <PlusIcon />
            New project
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={FolderKanbanIcon}
          label="Projects"
          value={stats?.totalProjects ?? 0}
          loading={!stats}
        />
        <StatCard
          icon={CrownIcon}
          label="You administer"
          value={stats?.adminProjects ?? 0}
          loading={!stats}
        />
        <StatCard
          icon={UsersIcon}
          label="Total seats"
          value={stats?.totalSeats ?? 0}
          loading={!stats}
        />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <InputGroup className="sm:max-w-xs">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Search projects…"
            value={search}
            onChange={(e) => withReset(setSearch)(e.target.value)}
            aria-label="Search projects"
          />
        </InputGroup>
        <div className="flex gap-2 sm:ml-auto">
          <Select
            value={role}
            onValueChange={(v) => withReset(setRole)(v as UserRole | "all")}
          >
            <SelectTrigger
              className="flex-1 sm:w-36"
              aria-label="Filter by role"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              {AvailableUserRoles.map((r) => (
                <SelectItem key={r} value={r}>
                  {roleLabels[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={sort}
            onValueChange={(v) => withReset(setSort)(v as ProjectSort)}
          >
            <SelectTrigger className="flex-1 sm:w-40" aria-label="Sort by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(sortLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={() =>
              withReset(setOrder)(order === "asc" ? "desc" : "asc")
            }
            aria-label={order === "asc" ? "Sort descending" : "Sort ascending"}
            title={order === "asc" ? "Ascending" : "Descending"}
          >
            {order === "asc" ? <ArrowUpIcon /> : <ArrowDownIcon />}
          </Button>
        </div>
      </div>

      {projects.isError ? (
        <QueryError
          title="Couldn't load projects"
          error={projects.error}
          onRetry={() => projects.refetch()}
          isRetrying={projects.isRefetching}
        />
      ) : projects.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <ProjectCardSkeleton key={i} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Empty className="border py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              {isFiltering ? <SearchIcon /> : <FolderKanbanIcon />}
            </EmptyMedia>
            <EmptyTitle>
              {isFiltering
                ? "No projects match your filters"
                : "No projects yet"}
            </EmptyTitle>
            <EmptyDescription>
              {isFiltering
                ? "Try a different search term or role."
                : "Create your first project to start collaborating with your team."}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            {isFiltering ? (
              <Button
                variant="outline"
                onClick={() => {
                  setSearch("");
                  setRole("all");
                  setPage(1);
                }}
              >
                Clear filters
              </Button>
            ) : (
              <Button onClick={() => setCreateOpen(true)}>
                <PlusIcon />
                Create project
              </Button>
            )}
          </EmptyContent>
        </Empty>
      ) : (
        <>
          <div
            className="grid gap-4 transition-opacity data-[stale=true]:opacity-60 sm:grid-cols-2 xl:grid-cols-3"
            data-stale={projects.isPlaceholderData}
          >
            {items.map((item) => (
              <ProjectCard
                key={item.project._id}
                item={item}
                onEdit={() => setEditing(item)}
                onDelete={() => setDeleting(item)}
              />
            ))}
          </div>
          <PaginationControls
            pagination={projects.data?.pagination}
            onPageChange={setPage}
            isFetching={projects.isFetching}
            itemLabel="projects"
          />
        </>
      )}

      <ProjectFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      {editing && (
        <ProjectFormDialog
          open
          onOpenChange={(open) => !open && setEditing(null)}
          project={editing.project}
        />
      )}
      {deleting && (
        <DeleteProjectDialog
          open
          onOpenChange={(open) => !open && setDeleting(null)}
          project={deleting.project}
        />
      )}
    </>
  );
}
