import {
  ArrowDownIcon,
  ArrowUpIcon,
  MailIcon,
  RotateCwIcon,
  SearchIcon,
  UserMinusIcon,
  UserPlusIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import { useState } from "react";

import { PaginationControls } from "@/components/common/pagination-controls";
import { QueryError } from "@/components/common/query-error";
import { RoleBadge } from "@/components/common/role-badge";
import { UserAvatar } from "@/components/common/user-avatar";
import { AddMemberDialog } from "@/components/members/add-member-dialog";
import { RoleSelect } from "@/components/members/role-select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCurrentUser } from "@/features/auth/hooks";
import type { MemberSort } from "@/features/projects/api";
import {
  useProjectInvites,
  useProjectMembers,
  useRemoveMember,
  useResendInvite,
  useRevokeInvite,
  useUpdateMemberRole,
} from "@/features/projects/hooks";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { displayName, formatDate, formatRelative } from "@/lib/format";
import { can, roleLabels } from "@/lib/permissions";
import type { ProjectMember, SortOrder, UserRole } from "@/types/models";

const PAGE_SIZE = 10;

const sortLabels: Record<MemberSort, string> = {
  joined: "Date joined",
  name: "Name",
  role: "Role",
};

interface MembersPanelProps {
  projectId: string;
  role: UserRole | undefined;
}

export function MembersPanel({ projectId, role }: MembersPanelProps) {
  const { data: currentUser } = useCurrentUser();
  const canManage = can(role, "members:manage");

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<MemberSort>("joined");
  const [order, setOrder] = useState<SortOrder>("asc");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search.trim());

  const members = useProjectMembers(projectId, {
    page,
    limit: PAGE_SIZE,
    sort,
    order,
    search: debouncedSearch || undefined,
  });
  const updateRole = useUpdateMemberRole(projectId);
  const removeMember = useRemoveMember(projectId);

  const [addOpen, setAddOpen] = useState(false);
  const [toRemove, setToRemove] = useState<ProjectMember | null>(null);

  const items = members.data?.items ?? [];
  const total = members.data?.pagination.total;
  const lastPage = members.data?.pagination.totalPages ?? 1;
  if (page > lastPage && !members.isFetching) setPage(lastPage);

  if (members.isError) {
    return (
      <QueryError
        title="Couldn't load members"
        error={members.error}
        onRetry={() => members.refetch()}
        isRetrying={members.isRefetching}
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Team members</CardTitle>
          <CardDescription>
            {total === undefined
              ? "People with access to this project"
              : debouncedSearch
                ? `${total} matching ${total === 1 ? "member" : "members"}`
                : `${total} ${total === 1 ? "person has" : "people have"} access to this project`}
          </CardDescription>
          {canManage && (
            <CardAction>
              <Button onClick={() => setAddOpen(true)}>
                <UserPlusIcon />
                <span className="hidden sm:inline">Add member</span>
              </Button>
            </CardAction>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <InputGroup className="sm:max-w-xs">
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                placeholder="Search by name or username…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                aria-label="Search members"
              />
            </InputGroup>
            <div className="flex gap-2 sm:ml-auto">
              <Select
                value={sort}
                onValueChange={(v) => {
                  setSort(v as MemberSort);
                  setPage(1);
                }}
              >
                <SelectTrigger className="flex-1 sm:w-36" aria-label="Sort by">
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
                onClick={() => {
                  setOrder(order === "asc" ? "desc" : "asc");
                  setPage(1);
                }}
                aria-label={
                  order === "asc" ? "Sort descending" : "Sort ascending"
                }
              >
                {order === "asc" ? <ArrowUpIcon /> : <ArrowDownIcon />}
              </Button>
            </div>
          </div>

          <div
            className="overflow-hidden rounded-lg border transition-opacity data-[stale=true]:opacity-60"
            data-stale={members.isPlaceholderData}
          >
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead className="hidden md:table-cell">Joined</TableHead>
                  <TableHead className="w-48">Role</TableHead>
                  {canManage && (
                    <TableHead className="w-12">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.isPending &&
                  Array.from({ length: 3 }, (_, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Skeleton className="size-8 rounded-full" />
                          <div className="space-y-1.5">
                            <Skeleton className="h-3.5 w-28" />
                            <Skeleton className="h-3 w-20" />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Skeleton className="h-3.5 w-20" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-7 w-32" />
                      </TableCell>
                      {canManage && <TableCell />}
                    </TableRow>
                  ))}

                {items.map((member) => {
                  const isSelf = member.user._id === currentUser?._id;
                  // The owner always stays an admin and can't be removed
                  const isLocked = isSelf || member.isOwner;
                  return (
                    <TableRow key={member.user._id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <UserAvatar user={member.user} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 font-medium">
                              <span className="truncate">
                                {displayName(member.user)}
                              </span>
                              {member.isOwner && (
                                <Badge className="h-4 px-1.5">Owner</Badge>
                              )}
                              {isSelf && (
                                <Badge
                                  variant="secondary"
                                  className="h-4 px-1.5"
                                >
                                  You
                                </Badge>
                              )}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">
                              @{member.user.username}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">
                        {formatDate(member.createdAt)}
                      </TableCell>
                      <TableCell>
                        {canManage && !isLocked ? (
                          <RoleSelect
                            size="sm"
                            className="w-40"
                            value={member.role}
                            aria-label={`Role for ${displayName(member.user)}`}
                            onValueChange={(newRole) =>
                              newRole !== member.role &&
                              updateRole.mutate({
                                userId: member.user._id,
                                role: newRole,
                              })
                            }
                          />
                        ) : (
                          <RoleBadge role={member.role} />
                        )}
                      </TableCell>
                      {canManage && (
                        <TableCell>
                          {!isLocked && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="text-muted-foreground hover:text-destructive"
                                  onClick={() => setToRemove(member)}
                                  aria-label={`Remove ${displayName(member.user)}`}
                                >
                                  <UserMinusIcon />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                Remove from project
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {members.isSuccess && items.length === 0 && (
              <Empty className="rounded-none border-t">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <UsersIcon />
                  </EmptyMedia>
                  <EmptyTitle>
                    {debouncedSearch ? "No matching members" : "No members yet"}
                  </EmptyTitle>
                  <EmptyDescription>
                    {debouncedSearch
                      ? `Nobody matches “${debouncedSearch}”.`
                      : "Invite teammates to collaborate on this project."}
                  </EmptyDescription>
                </EmptyHeader>
                {debouncedSearch && (
                  <EmptyContent>
                    <Button variant="outline" onClick={() => setSearch("")}>
                      Clear search
                    </Button>
                  </EmptyContent>
                )}
              </Empty>
            )}
          </div>

          <PaginationControls
            pagination={members.data?.pagination}
            onPageChange={setPage}
            isFetching={members.isFetching}
            itemLabel="members"
          />
        </CardContent>

        {canManage && (
          <AddMemberDialog
            projectId={projectId}
            open={addOpen}
            onOpenChange={setAddOpen}
          />
        )}

        <AlertDialog
          open={!!toRemove}
          onOpenChange={(open) => !open && setToRemove(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove member?</AlertDialogTitle>
              <AlertDialogDescription>
                {toRemove && (
                  <>
                    <span className="font-medium text-foreground">
                      {displayName(toRemove.user)}
                    </span>{" "}
                    will lose access to this project and be unassigned from its
                    tasks. You can add them again later.
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={removeMember.isPending}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={removeMember.isPending}
                onClick={(event) => {
                  event.preventDefault();
                  if (!toRemove) return;
                  removeMember.mutate(toRemove.user._id, {
                    onSuccess: () => setToRemove(null),
                  });
                }}
              >
                {removeMember.isPending && <Spinner />}
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Card>

      {canManage && <PendingInvites projectId={projectId} />}
    </div>
  );
}

/** Invitations sent to emails without an account (admins only) */
function PendingInvites({ projectId }: { projectId: string }) {
  const invites = useProjectInvites(projectId);
  const resend = useResendInvite(projectId);
  const revoke = useRevokeInvite(projectId);

  if (!invites.data?.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MailIcon className="size-4" />
          Pending invitations
        </CardTitle>
        <CardDescription>
          These people join automatically once they sign up and verify their
          email.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y rounded-lg border">
          {invites.data.map((invite) => (
            <li
              key={invite._id}
              className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{invite.email}</p>
                <p className="text-xs text-muted-foreground">
                  {roleLabels[invite.role]}
                  {invite.invitedBy &&
                    ` · invited by ${displayName(invite.invitedBy)}`}{" "}
                  ·{" "}
                  {invite.isExpired ? (
                    <span className="text-destructive">expired</span>
                  ) : (
                    `expires ${formatRelative(invite.expiresAt)}`
                  )}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => resend.mutate(invite._id)}
                  disabled={resend.isPending && resend.variables === invite._id}
                >
                  {resend.isPending && resend.variables === invite._id ? (
                    <Spinner />
                  ) : (
                    <RotateCwIcon />
                  )}
                  Resend
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => revoke.mutate(invite._id)}
                  disabled={revoke.isPending && revoke.variables === invite._id}
                >
                  <XIcon />
                  Revoke
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
