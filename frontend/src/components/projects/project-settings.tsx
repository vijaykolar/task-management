import { CrownIcon, LogOutIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import { UserAvatar } from "@/components/common/user-avatar";
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
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useCurrentUser } from "@/features/auth/hooks";
import {
  useLeaveProject,
  useMemberOptions,
  useTransferOwnership,
} from "@/features/projects/hooks";
import { displayName } from "@/lib/format";
import { can, roleLabels } from "@/lib/permissions";
import type { ProjectDetail } from "@/types/models";

interface ProjectSettingsProps {
  project: ProjectDetail;
  onEdit: () => void;
  onDelete: () => void;
}

export function ProjectSettings({
  project,
  onEdit,
  onDelete,
}: ProjectSettingsProps) {
  const canEdit = can(project.role, "project:update");
  const canDelete = can(project.role, "project:delete");

  return (
    <div className="space-y-4">
      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle>General</CardTitle>
            <CardDescription>
              Rename the project or update its description.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="font-medium">{project.name}</p>
            <p className="text-muted-foreground">
              {project.description || "No description"}
            </p>
          </CardContent>
          <CardFooter className="border-t">
            <Button variant="outline" onClick={onEdit}>
              <PencilIcon />
              Edit details
            </Button>
          </CardFooter>
        </Card>
      )}

      {project.isOwner ? (
        <TransferOwnershipCard project={project} />
      ) : (
        <LeaveProjectCard project={project} />
      )}

      {canDelete && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-destructive">Danger zone</CardTitle>
            <CardDescription>
              Deleting a project permanently removes its tasks, subtasks,
              attachments, notes, invitations and all member access.
            </CardDescription>
          </CardHeader>
          <CardFooter className="border-t border-destructive/20">
            <Button variant="destructive" onClick={onDelete}>
              <Trash2Icon />
              Delete this project
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}

function TransferOwnershipCard({ project }: { project: ProjectDetail }) {
  const { data: currentUser } = useCurrentUser();
  const members = useMemberOptions(project._id);
  const transfer = useTransferOwnership(project._id);
  const [newOwnerId, setNewOwnerId] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const candidates =
    members.data?.items.filter((m) => m.user._id !== currentUser?._id) ?? [];
  const newOwner = candidates.find((m) => m.user._id === newOwnerId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CrownIcon className="size-4 text-amber-500" />
          Transfer ownership
        </CardTitle>
        <CardDescription>
          You own this project. Owners can&apos;t leave or be removed, so hand
          it to another member first. They become an admin; you stay an admin.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {members.isSuccess && candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Add another member to the project before transferring ownership.
          </p>
        ) : (
          <Select
            value={newOwnerId}
            onValueChange={setNewOwnerId}
            disabled={members.isPending}
          >
            <SelectTrigger className="w-full sm:w-80" aria-label="New owner">
              <SelectValue placeholder="Choose the new owner" />
            </SelectTrigger>
            <SelectContent position="popper">
              {candidates.map(({ user, role }) => (
                <SelectItem key={user._id} value={user._id}>
                  <UserAvatar user={user} size="sm" />
                  {displayName(user)}
                  <span className="text-xs text-muted-foreground">
                    {roleLabels[role]}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </CardContent>
      <CardFooter className="border-t">
        <Button
          variant="outline"
          disabled={!newOwner}
          onClick={() => setConfirmOpen(true)}
        >
          <CrownIcon />
          Transfer ownership
        </Button>
      </CardFooter>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Transfer ownership?</AlertDialogTitle>
            <AlertDialogDescription>
              {newOwner && (
                <>
                  <span className="font-medium text-foreground">
                    {displayName(newOwner.user)}
                  </span>{" "}
                  will own “{project.name}”. You&apos;ll remain an admin, but
                  only they can transfer it again.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={transfer.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={transfer.isPending}
              onClick={(event) => {
                event.preventDefault();
                transfer.mutate(newOwnerId, {
                  onSuccess: () => {
                    setConfirmOpen(false);
                    setNewOwnerId("");
                  },
                });
              }}
            >
              {transfer.isPending && <Spinner />}
              Transfer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function LeaveProjectCard({ project }: { project: ProjectDetail }) {
  const navigate = useNavigate();
  const leave = useLeaveProject();
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Leave project</CardTitle>
        <CardDescription>
          You&apos;ll lose access to this project and be unassigned from its
          tasks. An admin can add you again later.
        </CardDescription>
      </CardHeader>
      <CardFooter className="border-t">
        <Button variant="outline" onClick={() => setConfirmOpen(true)}>
          <LogOutIcon />
          Leave project
        </Button>
      </CardFooter>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave “{project.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              You won&apos;t be able to see its tasks or notes anymore.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={leave.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={leave.isPending}
              onClick={(event) => {
                event.preventDefault();
                leave.mutate(project._id, {
                  onSuccess: () => {
                    toast.success(`You left “${project.name}”`);
                    navigate("/", { replace: true });
                  },
                });
              }}
            >
              {leave.isPending && <Spinner />}
              Leave project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
