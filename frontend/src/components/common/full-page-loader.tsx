import { FolderKanbanIcon } from "lucide-react";

import { Spinner } from "@/components/ui/spinner";

export function FullPageLoader() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4">
      <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <FolderKanbanIcon className="size-6" />
      </div>
      <Spinner className="size-5 text-muted-foreground" />
    </div>
  );
}
