import {
  BellIcon,
  CheckSquareIcon,
  FolderKanbanIcon,
  LayoutGridIcon,
  NotebookPenIcon,
  SearchIcon,
  UserCogIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

import { PriorityIcon } from "@/components/tasks/task-fields";
import { TaskStatusBadge } from "@/components/tasks/task-status-badge";
import { TaskKey, TaskTypeIcon } from "@/components/tasks/task-type";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { Spinner } from "@/components/ui/spinner";
import { MIN_SEARCH_LENGTH, useGlobalSearch } from "@/features/search/hooks";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { projectColor } from "@/lib/project-color";
import { cn } from "@/lib/utils";

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform);

const quickLinks = [
  { label: "Projects", to: "/", icon: LayoutGridIcon },
  { label: "My work", to: "/my-work", icon: CheckSquareIcon },
  { label: "Notifications", to: "/notifications", icon: BellIcon },
  { label: "Account settings", to: "/account", icon: UserCogIcon },
];

/** Header search button + ⌘K / Ctrl+K command palette */
export function GlobalSearch() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, 250);
  const search = useGlobalSearch(debounced);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const go = (to: string) => {
    setOpen(false);
    setQuery("");
    navigate(to);
  };

  const q = debounced.trim();
  const results = q.length >= MIN_SEARCH_LENGTH ? search.data : undefined;
  const hasResults =
    !!results &&
    results.projects.length + results.tasks.length + results.notes.length > 0;

  return (
    <>
      <Button
        variant="outline"
        className="h-8 w-9 justify-start px-2 text-muted-foreground sm:w-56 sm:px-3"
        onClick={() => setOpen(true)}
        aria-label="Search"
      >
        <SearchIcon />
        <span className="hidden flex-1 text-left sm:inline">Search…</span>
        <kbd className="pointer-events-none hidden rounded border bg-muted px-1.5 font-mono text-[10px] sm:inline">
          {isMac ? "⌘" : "Ctrl"} K
        </kbd>
      </Button>

      <CommandDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery("");
        }}
        title="Search"
        description="Search projects, tasks and notes"
        className="sm:max-w-xl"
      >
        {/* Results come from the server, so turn off cmdk's own filtering */}
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search projects, tasks and notes…"
          />
          <CommandList className="max-h-[60svh]">
            {q.length < MIN_SEARCH_LENGTH ? (
              <CommandGroup heading="Go to">
                {quickLinks.map(({ label, to, icon: Icon }) => (
                  <CommandItem key={to} value={to} onSelect={() => go(to)}>
                    <Icon />
                    {label}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : search.isFetching && !hasResults ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Spinner />
                Searching…
              </div>
            ) : (
              <>
                <CommandEmpty>No results for “{q}”.</CommandEmpty>

                {!!results?.projects.length && (
                  <CommandGroup heading="Projects">
                    {results.projects.map((project) => (
                      <CommandItem
                        key={project._id}
                        value={`project-${project._id}`}
                        onSelect={() => go(`/projects/${project._id}`)}
                      >
                        <span
                          className={cn(
                            "flex size-5 shrink-0 items-center justify-center rounded text-[10px] font-semibold text-white",
                            projectColor(project._id),
                          )}
                        >
                          {project.name.charAt(0).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{project.name}</span>
                          {project.description && (
                            <span className="block truncate text-xs text-muted-foreground">
                              {project.description}
                            </span>
                          )}
                        </span>
                        <FolderKanbanIcon className="text-muted-foreground" />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}

                {!!results?.tasks.length && (
                  <>
                    <CommandSeparator />
                    <CommandGroup heading="Tasks">
                      {results.tasks.map((task) => (
                        <CommandItem
                          key={task._id}
                          value={`task-${task._id}`}
                          onSelect={() =>
                            go(
                              `/projects/${task.project._id}?tab=tasks&task=${task._id}`,
                            )
                          }
                        >
                          <TaskTypeIcon type={task.type} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{task.title}</span>
                            <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                              <TaskKey value={task.key} />
                              <PriorityIcon
                                priority={task.priority}
                                className="size-3"
                              />
                              {task.project.name}
                            </span>
                          </span>
                          <TaskStatusBadge
                            status={task.status}
                            statuses={task.project.statuses}
                          />
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </>
                )}

                {!!results?.notes.length && (
                  <>
                    <CommandSeparator />
                    <CommandGroup heading="Notes">
                      {results.notes.map((note) => (
                        <CommandItem
                          key={note._id}
                          value={`note-${note._id}`}
                          onSelect={() =>
                            go(
                              `/projects/${note.project._id}?tab=notes&note=${note._id}`,
                            )
                          }
                        >
                          <NotebookPenIcon />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">
                              {note.excerpt}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {note.project.name}
                            </span>
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </>
                )}
              </>
            )}
          </CommandList>
          <div className="flex items-center justify-end gap-3 border-t px-3 py-2 text-xs text-muted-foreground">
            <span>
              <CommandShortcut>↑↓</CommandShortcut> navigate
            </span>
            <span>
              <CommandShortcut>↵</CommandShortcut> open
            </span>
            <span>
              <CommandShortcut>esc</CommandShortcut> close
            </span>
          </div>
        </Command>
      </CommandDialog>
    </>
  );
}
