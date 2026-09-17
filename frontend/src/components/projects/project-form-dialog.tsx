import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
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
  project?: Pick<Project, "_id" | "name" | "description" | "key"> & {
    keyLocked?: boolean;
  };
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

/** "Website redesign" -> "WR", "Website" -> "WEBS" (mirrors the backend) */
function suggestKey(name: string) {
  const words = name
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  let key =
    words.length >= 2
      ? words.map((word) => word[0]).join("")
      : (words[0] ?? "").slice(0, 4);
  key = key.toUpperCase().slice(0, 6);
  if (!key) return "";
  if (!/^[A-Z]/.test(key)) key = `P${key}`;
  return key.length < 2 ? `${key}PRJ`.slice(0, 4) : key;
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
      key: project?.key ?? "",
    },
  });
  // New projects suggest a key from the name until the key is edited by hand
  const [keyTouched, setKeyTouched] = useState(isEdit);
  const keyLocked = !!project?.keyLocked;

  const descriptionLength = useWatch({
    control: form.control,
    name: "description",
  }).length;

  const onSubmit = form.handleSubmit((values) => {
    const body = {
      name: values.name,
      description: values.description || undefined,
      key: values.key || undefined,
    };
    const onError = (error: unknown) => {
      if (error instanceof ApiClientError && error.statusCode === 409) {
        const field = /key/i.test(error.message) ? "key" : "name";
        form.setError(field, { type: "server", message: error.message });
        return;
      }
      applyServerFieldErrors(error, form.setError, [
        "name",
        "description",
        "key",
      ]);
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
                onChange={(event) => {
                  field.onChange(event);
                  if (!keyTouched) {
                    form.setValue("key", suggestKey(event.target.value));
                  }
                }}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name="key"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="project-key">Key</FieldLabel>
              <Input
                {...field}
                id="project-key"
                placeholder="e.g. WEB"
                maxLength={10}
                aria-invalid={fieldState.invalid}
                disabled={keyLocked}
                className="w-40 font-mono uppercase"
                onChange={(event) => {
                  setKeyTouched(true);
                  field.onChange(event.target.value.toUpperCase());
                }}
              />
              {fieldState.error ? (
                <FieldError errors={[fieldState.error]} />
              ) : (
                <FieldDescription>
                  {keyLocked
                    ? "The key can't change once the project has tasks."
                    : `Tickets are numbered ${field.value || "KEY"}-1, ${field.value || "KEY"}-2…`}
                </FieldDescription>
              )}
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
