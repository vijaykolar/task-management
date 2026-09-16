import { lazy, Suspense, type ComponentProps } from "react";

import { Skeleton } from "@/components/ui/skeleton";

// Tiptap is large; load it only when an editor is actually shown
const RichTextEditorImpl = lazy(() =>
  import("@/components/rich-text/rich-text-editor").then((module) => ({
    default: module.RichTextEditor,
  })),
);

type RichTextEditorProps = ComponentProps<typeof RichTextEditorImpl>;

export function RichTextEditor(props: RichTextEditorProps) {
  return (
    <Suspense
      fallback={
        <div className="overflow-hidden rounded-lg border">
          <Skeleton className="h-9 rounded-none" />
          <Skeleton className="m-3 h-20" />
        </div>
      }
    >
      <RichTextEditorImpl {...props} />
    </Suspense>
  );
}
