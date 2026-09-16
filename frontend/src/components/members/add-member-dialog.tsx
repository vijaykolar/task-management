import { zodResolver } from "@hookform/resolvers/zod";
import { MailIcon } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { FormAlert } from "@/components/common/form-alert";
import { RoleSelect } from "@/components/members/role-select";
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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { useAddMember } from "@/features/projects/hooks";
import {
  addMemberSchema,
  type AddMemberValues,
} from "@/features/projects/schemas";
import { applyServerFieldErrors } from "@/lib/form-errors";
import { UserRoles } from "@/types/models";

interface AddMemberDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddMemberDialog({
  projectId,
  open,
  onOpenChange,
}: AddMemberDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Mounted only while open, so form + mutation state start fresh */}
        <AddMemberForm
          projectId={projectId}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function AddMemberForm({
  projectId,
  onDone,
}: {
  projectId: string;
  onDone: () => void;
}) {
  const addMember = useAddMember(projectId);

  const form = useForm<AddMemberValues>({
    resolver: zodResolver(addMemberSchema),
    defaultValues: { email: "", role: UserRoles.MEMBER },
  });

  const onSubmit = form.handleSubmit((values) => {
    addMember.mutate(values, {
      onSuccess: ({ status }) => {
        toast.success(
          status === "invited"
            ? `Invitation sent to ${values.email}`
            : status === "updated"
              ? "Already a member: role updated"
              : "Member added and notified by email",
        );
        onDone();
      },
      onError: (error) =>
        applyServerFieldErrors(error, form.setError, ["email", "role"]),
    });
  });

  const errorMessage =
    addMember.error && addMember.error.statusCode !== 422
      ? addMember.error.message
      : null;

  return (
    <form onSubmit={onSubmit} noValidate>
      <DialogHeader>
        <DialogTitle>Add member</DialogTitle>
        <DialogDescription>
          Existing users are added right away and notified by email. Anyone
          without an account gets an invitation to sign up and joins after
          verifying their email.
        </DialogDescription>
      </DialogHeader>

      <FieldGroup className="py-6">
        <Controller
          control={form.control}
          name="email"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="member-email">Email</FieldLabel>
              <InputGroup>
                <InputGroupAddon>
                  <MailIcon />
                </InputGroupAddon>
                <InputGroupInput
                  {...field}
                  id="member-email"
                  type="email"
                  placeholder="teammate@example.com"
                  aria-invalid={fieldState.invalid}
                  autoFocus
                />
              </InputGroup>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name="role"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="member-role">Role</FieldLabel>
              <RoleSelect
                id="member-role"
                value={field.value}
                onValueChange={field.onChange}
                aria-invalid={fieldState.invalid}
                className="w-full"
              />
              {fieldState.error ? (
                <FieldError errors={[fieldState.error]} />
              ) : (
                <FieldDescription>You can change this later.</FieldDescription>
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
        <Button type="submit" disabled={addMember.isPending}>
          {addMember.isPending && <Spinner />}
          Add member
        </Button>
      </DialogFooter>
    </form>
  );
}
