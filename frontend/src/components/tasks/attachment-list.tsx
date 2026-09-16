import {
  FileArchiveIcon,
  FileIcon,
  FileImageIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  Trash2Icon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { formatBytes } from "@/lib/format";
import type { TaskAttachment } from "@/types/models";

export function AttachmentIcon({ mimetype }: { mimetype: string }) {
  const Icon = mimetype.startsWith("image/")
    ? FileImageIcon
    : /pdf|text|word|document|presentation|powerpoint/.test(mimetype)
      ? FileTextIcon
      : /sheet|excel|csv/.test(mimetype)
        ? FileSpreadsheetIcon
        : /zip/.test(mimetype)
          ? FileArchiveIcon
          : FileIcon;

  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
      <Icon className="size-4" />
    </span>
  );
}

interface AttachmentListProps {
  attachments: TaskAttachment[];
  onRemove?: (attachment: TaskAttachment) => void;
  removingId?: string;
}

export function AttachmentList({
  attachments,
  onRemove,
  removingId,
}: AttachmentListProps) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {attachments.map((file) => {
        const isImage = file.mimetype.startsWith("image/");
        return (
          <li
            key={file._id}
            className="group/file relative flex items-center gap-3 rounded-lg border p-2 transition-colors hover:bg-muted/50"
          >
            {isImage ? (
              <img
                src={file.url}
                alt=""
                loading="lazy"
                className="size-9 shrink-0 rounded-md border object-cover"
              />
            ) : (
              <AttachmentIcon mimetype={file.mimetype} />
            )}
            <div className="min-w-0 flex-1">
              <a
                href={file.url}
                target="_blank"
                rel="noreferrer"
                className="block truncate text-sm font-medium after:absolute after:inset-0 hover:underline"
                title={file.name}
              >
                {file.name}
              </a>
              <p className="text-xs text-muted-foreground">
                {formatBytes(file.size)}
              </p>
            </div>
            {onRemove && (
              <Button
                variant="ghost"
                size="icon-xs"
                className="relative z-10 text-muted-foreground hover:text-destructive"
                onClick={() => onRemove(file)}
                disabled={removingId === file._id}
                aria-label={`Remove ${file.name}`}
              >
                {removingId === file._id ? <Spinner /> : <Trash2Icon />}
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
