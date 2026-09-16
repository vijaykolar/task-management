import {
  EllipsisIcon,
  NotebookPenIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";

import { QueryError } from "@/components/common/query-error";
import { UserAvatar } from "@/components/common/user-avatar";
import { NoteFormDialog } from "@/components/notes/note-form-dialog";
import { RichTextContent } from "@/components/rich-text/rich-text-content";
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
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import type { NoteSort } from "@/features/notes/api";
import { useDeleteNote, useNote, useNotes } from "@/features/notes/hooks";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { displayName, formatDate, formatRelative } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { Note, UserRole } from "@/types/models";

interface NotesPanelProps {
  projectId: string;
  role: UserRole | undefined;
}

const wasEdited = (note: Note) =>
  new Date(note.updatedAt).getTime() - new Date(note.createdAt).getTime() >
  1000;

function NoteMeta({ note }: { note: Note }) {
  return (
    <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
      {note.createdBy && <UserAvatar user={note.createdBy} size="sm" />}
      <span className="truncate">
        <span className="font-medium text-foreground">
          {note.createdBy ? displayName(note.createdBy) : "Unknown"}
        </span>{" "}
        · {formatRelative(note.updatedAt)}
        {wasEdited(note) && " (edited)"}
      </span>
    </div>
  );
}

export function NotesPanel({ projectId, role }: NotesPanelProps) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<NoteSort>("updatedAt");
  const debouncedSearch = useDebouncedValue(search.trim());

  const notes = useNotes(projectId, {
    sort,
    order: "desc",
    search: debouncedSearch || undefined,
  });
  const deleteNote = useDeleteNote(projectId);
  const canManage = can(role, "note:manage");

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Note | null>(null);
  const [deleting, setDeleting] = useState<Note | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const viewingId = searchParams.get("note");
  const setViewingId = (noteId: string | null) =>
    setSearchParams(
      (params) => {
        if (noteId) params.set("note", noteId);
        else params.delete("note");
        return params;
      },
      { replace: !noteId },
    );

  const visible = notes.data?.pages.flatMap((page) => page.items) ?? [];
  const total = notes.data?.pages[0]?.pagination.total ?? 0;

  if (notes.isError) {
    return (
      <QueryError
        title="Couldn't load notes"
        error={notes.error}
        onRetry={() => notes.refetch()}
        isRetrying={notes.isRefetching}
      />
    );
  }

  const hasNoNotes = notes.isSuccess && total === 0 && !debouncedSearch;

  return (
    <div className="space-y-4">
      {!hasNoNotes && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <InputGroup className="sm:max-w-xs">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Search notes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search notes"
            />
          </InputGroup>
          <Select value={sort} onValueChange={(v) => setSort(v as NoteSort)}>
            <SelectTrigger className="sm:w-44" aria-label="Sort notes">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updatedAt">Recently updated</SelectItem>
              <SelectItem value="createdAt">Recently created</SelectItem>
            </SelectContent>
          </Select>
          {notes.isFetching && !notes.isPending && (
            <Spinner className="text-muted-foreground" />
          )}
          {canManage && (
            <Button className="sm:ml-auto" onClick={() => setCreateOpen(true)}>
              <PlusIcon />
              New note
            </Button>
          )}
        </div>
      )}

      {notes.isPending ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Card key={i}>
              <CardContent className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-2/3" />
              </CardContent>
              <CardFooter>
                <Skeleton className="h-6 w-40" />
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : hasNoNotes ? (
        <Empty className="border py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <NotebookPenIcon />
            </EmptyMedia>
            <EmptyTitle>No notes yet</EmptyTitle>
            <EmptyDescription>
              {canManage
                ? "Capture decisions, meeting notes and important links for the whole team."
                : "Notes shared by project admins will appear here."}
            </EmptyDescription>
          </EmptyHeader>
          {canManage && (
            <EmptyContent>
              <Button onClick={() => setCreateOpen(true)}>
                <PlusIcon />
                Write first note
              </Button>
            </EmptyContent>
          )}
        </Empty>
      ) : visible.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No notes match “{debouncedSearch}”</EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" onClick={() => setSearch("")}>
              Clear search
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-2">
          {visible.map((note) => (
            <Card
              key={note._id}
              className="relative gap-4 transition-shadow hover:shadow-md"
            >
              <CardHeader className="pb-0">
                <NoteMeta note={note} />
                {canManage && (
                  <CardAction className="relative z-10">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label="Note actions"
                        >
                          <EllipsisIcon />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setEditing(note)}>
                          <PencilIcon />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => setDeleting(note)}
                        >
                          <Trash2Icon />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </CardAction>
                )}
              </CardHeader>
              <CardContent>
                {/* Formatted preview that fades out when the note is long */}
                <div className="max-h-44 overflow-hidden mask-[linear-gradient(to_bottom,black_70%,transparent)]">
                  <RichTextContent html={note.content} />
                </div>
                <button
                  type="button"
                  onClick={() => setViewingId(note._id)}
                  className="absolute inset-0 rounded-[inherit] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <span className="sr-only">Open note</span>
                </button>
              </CardContent>
            </Card>
          ))}
          {notes.hasNextPage && (
            <Button
              variant="outline"
              className="md:col-span-2"
              onClick={() => notes.fetchNextPage()}
              disabled={notes.isFetchingNextPage}
            >
              {notes.isFetchingNextPage && <Spinner />}
              Load more ({total - visible.length} remaining)
            </Button>
          )}
        </div>
      )}

      <NoteViewDialog
        projectId={projectId}
        noteId={viewingId}
        canManage={canManage}
        onClose={() => setViewingId(null)}
        onEdit={(note) => {
          setViewingId(null);
          setEditing(note);
        }}
      />

      {canManage && (
        <>
          <NoteFormDialog
            projectId={projectId}
            open={createOpen}
            onOpenChange={setCreateOpen}
          />
          <NoteFormDialog
            projectId={projectId}
            open={editing !== null}
            onOpenChange={(open) => !open && setEditing(null)}
            note={editing ?? undefined}
          />
        </>
      )}

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete note?</AlertDialogTitle>
            <AlertDialogDescription>
              This note will be permanently removed for everyone in the project.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteNote.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteNote.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (!deleting) return;
                deleteNote.mutate(deleting._id, {
                  onSuccess: () => setDeleting(null),
                });
              }}
            >
              {deleteNote.isPending && <Spinner />}
              Delete note
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Full note, loaded from GET /notes/:projectId/n/:noteId */
function NoteViewDialog({
  projectId,
  noteId,
  canManage,
  onClose,
  onEdit,
}: {
  projectId: string;
  noteId: string | null;
  canManage: boolean;
  onClose: () => void;
  onEdit: (note: Note) => void;
}) {
  const note = useNote(projectId, noteId);

  return (
    <Dialog open={!!noteId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Note</DialogTitle>
          <DialogDescription asChild>
            <div>
              {note.data ? (
                <span>
                  Created {formatDate(note.data.createdAt)}
                  {wasEdited(note.data) &&
                    ` · edited ${formatRelative(note.data.updatedAt)}`}
                </span>
              ) : (
                <Skeleton className="h-4 w-40" />
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        {note.isError ? (
          <QueryError error={note.error} title="Couldn't load note" />
        ) : note.data ? (
          <>
            <NoteMeta note={note.data} />
            <RichTextContent html={note.data.content} />
          </>
        ) : (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        )}

        {canManage && note.data && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onEdit(note.data)}>
              <PencilIcon />
              Edit note
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
