import Image from "@tiptap/extension-image";
import type { EditorView } from "@tiptap/pm/view";
import { toast } from "sonner";

import { formatBytes } from "@/lib/format";
import { isUploadedImageUrl } from "@/lib/rich-text";

// Mirrors uploadRichTextImage in backend/src/middlewares/multer.middleware.ts
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = "image/png,image/jpeg,image/gif,image/webp";
const IMAGE_TYPE_PATTERN = /^image\/(png|jpe?g|gif|webp)$/;

/** Uploads an image and resolves to its public URL */
export type ImageUploader = (file: File) => Promise<string>;

/**
 * Image node with a temporary `uploadId`: while a pasted image uploads it shows
 * a local preview, then the upload's URL replaces it in place.
 */
export const UploadableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      uploadId: {
        default: null,
        parseHTML: () => null,
        renderHTML: (attributes: { uploadId?: string | null }) =>
          attributes.uploadId ? { "data-uploading": "" } : {},
      },
    };
  },
}).configure({ inline: false, allowBase64: false });

export const imageFilesIn = (list: FileList | File[] | null | undefined) =>
  Array.from(list ?? []).filter((file) => IMAGE_TYPE_PATTERN.test(file.type));

/** Finds the position of the placeholder node for an upload */
function findUpload(view: EditorView, uploadId: string) {
  let found: number | null = null;
  view.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.type.name === "image" && node.attrs.uploadId === uploadId) {
      found = pos;
      return false;
    }
    return true;
  });
  return found as number | null;
}

/**
 * Inserts images at `pos` (default: the cursor, replacing any selection) and
 * uploads them. Each shows a local preview until its upload finishes.
 */
export function insertImages(
  view: EditorView,
  files: File[],
  upload: ImageUploader,
  onPendingChange: (delta: number) => void,
  pos?: number,
) {
  const { schema } = view.state;
  const imageType = schema.nodes.image;
  if (!imageType) return;

  let insertAt = pos;
  for (const file of files) {
    if (file.size > MAX_IMAGE_SIZE) {
      toast.error(
        `“${file.name || "Image"}” is larger than ${formatBytes(MAX_IMAGE_SIZE)}`,
      );
      continue;
    }

    const uploadId = crypto.randomUUID();
    const previewUrl = URL.createObjectURL(file);
    const node = imageType.create({
      src: previewUrl,
      alt: file.name || "Pasted image",
      uploadId,
    });

    const tr =
      insertAt === undefined
        ? view.state.tr.replaceSelectionWith(node)
        : view.state.tr.insert(insertAt, node);
    view.dispatch(tr.scrollIntoView());
    // Further images go right after this one
    if (insertAt !== undefined) insertAt += node.nodeSize;

    onPendingChange(1);
    upload(file)
      .then((url) => {
        // The editor may have closed while uploading
        if (view.isDestroyed) return;
        const at = findUpload(view, uploadId);
        if (at === null) return; // removed while uploading
        const current = view.state.doc.nodeAt(at);
        view.dispatch(
          view.state.tr.setNodeMarkup(at, undefined, {
            ...current?.attrs,
            src: url,
            uploadId: null,
          }),
        );
      })
      .catch((error: unknown) => {
        const at = view.isDestroyed ? null : findUpload(view, uploadId);
        if (at !== null) {
          const current = view.state.doc.nodeAt(at);
          view.dispatch(
            view.state.tr.delete(at, at + (current?.nodeSize ?? 1)),
          );
        }
        toast.error(
          error instanceof Error ? error.message : "Couldn't upload the image",
        );
      })
      .finally(() => {
        URL.revokeObjectURL(previewUrl);
        onPendingChange(-1);
      });
  }
}

/**
 * Pasted HTML can carry images from other sites. Only images uploaded here
 * survive saving, so drop the rest now instead of letting them vanish later.
 */
export function stripForeignImages(html: string) {
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const src = /\ssrc\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] ?? "";
    return isUploadedImageUrl(src) ? tag : "";
  });
}
