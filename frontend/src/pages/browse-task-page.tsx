import { useQuery } from "@tanstack/react-query";
import { SearchXIcon } from "lucide-react";
import { Link, Navigate, useParams } from "react-router";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { tasksApi } from "@/features/tasks/api";

/** /browse/SPST-12 — shareable ticket links that open the task in its project */
export function BrowseTaskPage() {
  const { taskKey = "" } = useParams();
  const task = useQuery({
    queryKey: ["browse", taskKey.toUpperCase()],
    queryFn: () => tasksApi.byKey(taskKey).then((res) => res.data),
    retry: false,
  });

  if (task.isPending) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    );
  }

  if (task.isError) {
    return (
      <Empty className="border py-16">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchXIcon />
          </EmptyMedia>
          <EmptyTitle>{taskKey.toUpperCase()} not found</EmptyTitle>
          <EmptyDescription>
            The task doesn&apos;t exist, was deleted, or belongs to a project
            you&apos;re not a member of.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild variant="outline">
            <Link to="/">Back to projects</Link>
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <Navigate
      replace
      to={`/projects/${task.data.project}?tab=tasks&task=${task.data._id}`}
    />
  );
}
