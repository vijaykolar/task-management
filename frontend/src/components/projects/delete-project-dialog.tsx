import { Trash2Icon } from "lucide-react";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useDeleteProject } from "@/features/projects/hooks";
import type { Project } from "@/types/models";

interface DeleteProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Pick<Project, "_id" | "name">;
  onDeleted?: () => void;
}

export function DeleteProjectDialog({
  open,
  onOpenChange,
  project,
  onDeleted,
}: DeleteProjectDialogProps) {
  const deleteProject = useDeleteProject();
  const [confirmation, setConfirmation] = useState("");
  const confirmed = confirmation.trim() === project.name;

  const handleOpenChange = (next: boolean) => {
    if (!next) setConfirmation("");
    onOpenChange(next);
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-destructive/10 text-destructive">
            <Trash2Icon />
          </AlertDialogMedia>
          <AlertDialogTitle>Delete “{project.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes the project and removes every member&apos;s
            access. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <Field>
          <FieldLabel htmlFor="confirm-project-name" className="font-normal">
            Type <span className="font-semibold">{project.name}</span> to
            confirm
          </FieldLabel>
          <Input
            id="confirm-project-name"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            autoComplete="off"
          />
        </Field>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteProject.isPending}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={!confirmed || deleteProject.isPending}
            onClick={(event) => {
              // Keep the dialog open until the request finishes
              event.preventDefault();
              deleteProject.mutate(project._id, {
                onSuccess: () => {
                  handleOpenChange(false);
                  onDeleted?.();
                },
              });
            }}
          >
            {deleteProject.isPending && <Spinner />}
            Delete project
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
