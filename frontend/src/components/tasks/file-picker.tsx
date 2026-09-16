import { UploadCloudIcon, XIcon } from "lucide-react";
import { useId, useRef, useState } from "react";

import { AttachmentIcon } from "@/components/tasks/attachment-list";
import { Button } from "@/components/ui/button";
import {
  ACCEPTED_FILE_TYPES,
  MAX_ATTACHMENT_SIZE,
  MAX_FILES_PER_UPLOAD,
  validateFiles,
} from "@/features/tasks/schemas";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";

interface FilePickerProps {
  files: File[];
  onChange: (files: File[]) => void;
  /** Attachments the task already has, for the per-task limit */
  existingCount?: number;
  disabled?: boolean;
}

export function FilePicker({
  files,
  onChange,
  existingCount = 0,
  disabled,
}: FilePickerProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const error = validateFiles(files, existingCount);

  const addFiles = (incoming: FileList | null) => {
    if (!incoming?.length) return;
    // Skip duplicates (same name + size)
    const next = [...files];
    for (const file of incoming) {
      if (!next.some((f) => f.name === file.name && f.size === file.size)) {
        next.push(file);
      }
    }
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (!disabled) addFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-4 py-5 text-center transition-colors hover:bg-muted/50",
          isDragging && "border-primary bg-primary/5",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        <UploadCloudIcon className="size-5 text-muted-foreground" />
        <span className="text-sm font-medium">
          Drop files here or click to browse
        </span>
        <span className="text-xs text-muted-foreground">
          Up to {MAX_FILES_PER_UPLOAD} files, {formatBytes(MAX_ATTACHMENT_SIZE)}{" "}
          each · images, PDF, docs, text, zip
        </span>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          multiple
          accept={ACCEPTED_FILE_TYPES}
          className="sr-only"
          disabled={disabled}
          onChange={(e) => {
            addFiles(e.target.files);
            // Allow picking the same file again after removing it
            e.target.value = "";
          }}
        />
      </label>

      {files.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${file.size}`}
              className="flex items-center gap-3 px-3 py-2"
            >
              <AttachmentIcon mimetype={file.type} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{file.name}</p>
                <p
                  className={cn(
                    "text-xs text-muted-foreground",
                    file.size > MAX_ATTACHMENT_SIZE && "text-destructive",
                  )}
                >
                  {formatBytes(file.size)}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => onChange(files.filter((_, i) => i !== index))}
                aria-label={`Remove ${file.name}`}
                disabled={disabled}
              >
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
