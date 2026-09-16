import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import { useNavigate } from "react-router";

import { FormAlert } from "@/components/common/form-alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useCreateProject, useUpdateProject } from "@/features/projects/hooks";
import { projectSchema, type ProjectValues } from "@/features/projects/schemas";
import { ApiClientError } from "@/lib/axios";
import { applyServerFieldErrors } from "@/lib/form-errors";
import type { Project } from "@/types/models";

interface ProjectFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pass a project to edit it; omit to create a new one */
  project?: Pick<Project, "_id" | "name" | "description">;
}

export function ProjectFormDialog({
  open,
  onOpenChange,
  project,
}: ProjectFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {/* Mounted only while open, so form + mutation state start fresh */}
        <ProjectForm project={project} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ProjectForm({
  project,
  onDone,
}: Pick<ProjectFormDialogProps, "project"> & { onDone: () => void }) {
  const isEdit = !!project;
  const navigate = useNavigate();
  const createProject = useCreateProject();
  const updateProject = useUpdateProject(project?._id ?? "");
  const mutation = isEdit ? updateProject : createProject;

  const form = useForm<ProjectValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      name: project?.name ?? "",
      description: project?.description ?? "",
    },
  });

  const descriptionLength = useWatch({
    control: form.control,
    name: "description",
  }).length;

  const onSubmit = form.handleSubmit((values) => {
    const body = {
      name: values.name,
      description: values.description || undefined,
    };
    const onError = (error: unknown) => {
      if (error instanceof ApiClientError && error.statusCode === 409) {
        form.setError("name", { type: "server", message: error.message });
        return;
      }
      applyServerFieldErrors(error, form.setError, ["name", "description"]);
    };

    if (isEdit) {
      updateProject.mutate(body, {
        onSuccess: onDone,
        onError,
      });
    } else {
      createProject.mutate(body, {
        onSuccess: (created) => {
          onDone();
          navigate(`/projects/${created._id}`);
        },
        onError,
      });
    }
  });

  // 409 = you already own a project with this name (unique per owner)
  const errorMessage =
    mutation.error &&
    mutation.error.statusCode !== 422 &&
    mutation.error.statusCode !== 409
      ? mutation.error.message
      : null;

  return (
    <form onSubmit={onSubmit} noValidate>
      <DialogHeader>
        <DialogTitle>{isEdit ? "Edit project" : "New project"}</DialogTitle>
        <DialogDescription>
          {isEdit
            ? "Update the project's name and description."
            : "Create a project. You'll be its admin and can invite teammates."}
        </DialogDescription>
      </DialogHeader>

      <FieldGroup className="py-6">
        <Controller
          control={form.control}
          name="name"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="project-name">Name</FieldLabel>
              <Input
                {...field}
                id="project-name"
                placeholder="e.g. Website redesign"
                aria-invalid={fieldState.invalid}
                autoFocus
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name="description"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="project-description">Description</FieldLabel>
              <Textarea
                {...field}
                id="project-description"
                rows={4}
                placeholder="What is this project about?"
                aria-invalid={fieldState.invalid}
                className="resize-none"
              />
              {fieldState.error ? (
                <FieldError errors={[fieldState.error]} />
              ) : (
                <FieldDescription className="text-right tabular-nums">
                  {descriptionLength}/500
                </FieldDescription>
              )}
            </Field>
          )}
        />
        <FormAlert message={errorMessage} />
      </FieldGroup>

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending && <Spinner />}
          {isEdit ? "Save changes" : "Create project"}
        </Button>
      </DialogFooter>
    </form>
  );
}
