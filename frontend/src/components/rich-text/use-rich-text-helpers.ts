import { useCallback, useState } from "react";

import type { ImageUploader } from "@/components/rich-text/image-upload";
import type { MentionItem } from "@/components/rich-text/mention-list";
import { projectsApi } from "@/features/projects/api";
import { useMemberOptions } from "@/features/projects/hooks";

/** Project members matching an @query, by username or name */
export function useMentionItems(projectId: string) {
  const members = useMemberOptions(projectId);
  return (query: string): MentionItem[] => {
    const term = query.toLowerCase();
    return (members.data?.items ?? [])
      .filter(
        ({ user }) =>
          user.username.toLowerCase().includes(term) ||
          (user.fullName ?? "").toLowerCase().includes(term),
      )
      .slice(0, 6)
      .map(({ user }) => ({ id: user._id, label: user.username, user }));
  };
}

/**
 * Image uploads for a rich text editor in a project, plus how many are still
 * in flight (disable saving while `uploading > 0`).
 */
export function useImageUploads(projectId: string) {
  const [uploading, setUploading] = useState(0);
  const upload: ImageUploader = useCallback(
    (file) =>
      projectsApi.uploadImage(projectId, file).then((res) => res.data.url),
    [projectId],
  );
  return {
    uploading,
    editorProps: { onImageUpload: upload, onUploadingChange: setUploading },
  };
}
