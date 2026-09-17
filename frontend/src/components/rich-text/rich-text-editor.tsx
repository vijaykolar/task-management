import { Mention } from "@tiptap/extension-mention";
import { Placeholder } from "@tiptap/extension-placeholder";
import {
  EditorContent,
  ReactRenderer,
  useEditor,
  useEditorState,
  type Editor,
} from "@tiptap/react";
import type { SuggestionProps } from "@tiptap/suggestion";
import StarterKit from "@tiptap/starter-kit";
import {
  BoldIcon,
  CodeIcon,
  Heading2Icon,
  Heading3Icon,
  ImageIcon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  QuoteIcon,
  Redo2Icon,
  SquareCodeIcon,
  StrikethroughIcon,
  UnderlineIcon,
  Undo2Icon,
  type LucideIcon,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from "react";

import {
  ACCEPTED_IMAGE_TYPES,
  imageFilesIn,
  insertImages,
  stripForeignImages,
  UploadableImage,
  type ImageUploader,
} from "@/components/rich-text/image-upload";
import {
  MentionList,
  type MentionItem,
  type MentionListHandle,
} from "@/components/rich-text/mention-list";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface RichTextEditorProps {
  /** Initial HTML. The editor is uncontrolled: remount (key) to reset it. */
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  /** Called on Ctrl/⌘ + Enter */
  onSubmitShortcut?: () => void;
  className?: string;
  contentClassName?: string;
  id?: string;
  "aria-label"?: string;
  /** Enables @mentions; returns the people matching what was typed */
  mentionItems?: (query: string) => MentionItem[];
  /**
   * Enables images: pasted, dropped or picked images upload through this and
   * appear where the cursor (or drop point) is
   */
  onImageUpload?: ImageUploader;
  /** Called with the number of images still uploading (block saving until 0) */
  onUploadingChange?: (uploading: number) => void;
}

/** Marks popups rendered outside the editor (e.g. mentions) so dialogs ignore them */
const FLOATING_POPUP_ATTR = "data-floating-popup";

type MentionSuggestionProps = SuggestionProps<
  MentionItem,
  { id: string; label: string }
>;

function mentionExtension(
  itemsRef: RefObject<RichTextEditorProps["mentionItems"]>,
) {
  return Mention.configure({
    HTMLAttributes: { class: "mention" },
    renderText: ({ node }) => `@${node.attrs.label ?? node.attrs.id}`,
    suggestion: {
      char: "@",
      items: ({ query }) => itemsRef.current?.(query) ?? [],
      render: () => {
        let renderer: ReactRenderer<
          MentionListHandle,
          MentionSuggestionProps
        > | null = null;
        let unmount: (() => void) | null = null;

        const close = () => {
          unmount?.();
          renderer?.destroy();
          unmount = null;
          renderer = null;
        };

        return {
          onStart: (props) => {
            renderer = new ReactRenderer(MentionList, {
              props,
              editor: props.editor,
            });
            const element = renderer.element as HTMLElement;
            element.setAttribute(FLOATING_POPUP_ATTR, "");
            // Modal dialogs disable pointer events outside themselves
            element.style.pointerEvents = "auto";
            element.style.zIndex = "100";
            unmount = props.mount(element);
          },
          onUpdate: (props) => renderer?.updateProps(props),
          onKeyDown: (props) => {
            if (props.event.key === "Escape") {
              close();
              return true;
            }
            return renderer?.ref?.onKeyDown(props) ?? false;
          },
          onExit: close,
        };
      },
    },
  });
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Write something…",
  autoFocus,
  disabled,
  invalid,
  onSubmitShortcut,
  className,
  contentClassName,
  id,
  "aria-label": ariaLabel,
  mentionItems,
  onImageUpload,
  onUploadingChange,
}: RichTextEditorProps) {
  // The editor is configured once; read the latest callbacks through refs
  const mentionItemsRef = useRef(mentionItems);
  const uploadRef = useRef(onImageUpload);
  const uploadingChangeRef = useRef(onUploadingChange);
  useEffect(() => {
    mentionItemsRef.current = mentionItems;
    uploadRef.current = onImageUpload;
    uploadingChangeRef.current = onUploadingChange;
  });

  const uploadingRef = useRef(0);
  const trackUpload = (delta: number) => {
    uploadingRef.current += delta;
    uploadingChangeRef.current?.(uploadingRef.current);
  };
  const canUploadImages = !!onImageUpload;
  const [extensions] = useState(() => [
    StarterKit.configure({
      heading: { levels: [2, 3] },
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
        HTMLAttributes: {
          target: "_blank",
          rel: "noopener noreferrer nofollow",
        },
      },
    }),
    Placeholder.configure({ placeholder }),
    ...(mentionItems ? [mentionExtension(mentionItemsRef)] : []),
    ...(onImageUpload ? [UploadableImage] : []),
  ]);

  const editor = useEditor({
    extensions,
    content: value,
    editable: !disabled,
    autofocus: autoFocus ? "end" : false,
    // Avoid SSR hydration warnings; this app renders on the client only
    immediatelyRender: true,
    editorProps: {
      attributes: {
        ...(id && { id }),
        role: "textbox",
        "aria-multiline": "true",
        ...(ariaLabel && { "aria-label": ariaLabel }),
        class: cn(
          "rich-text min-h-32 px-3 py-2.5 text-sm outline-none",
          contentClassName,
        ),
      },
      // Images pasted from the clipboard (e.g. screenshots) go where the cursor is
      handlePaste: (view, event) => {
        const upload = uploadRef.current;
        const files = imageFilesIn(event.clipboardData?.files);
        if (!upload || files.length === 0) return false;
        event.preventDefault();
        insertImages(view, files, upload, trackUpload);
        return true;
      },
      // Dropped images go where they are dropped
      handleDrop: (view, event, _slice, moved) => {
        const upload = uploadRef.current;
        const files = imageFilesIn(event.dataTransfer?.files);
        if (moved || !upload || files.length === 0) return false;
        event.preventDefault();
        const pos = view.posAtCoords({
          left: event.clientX,
          top: event.clientY,
        })?.pos;
        insertImages(view, files, upload, trackUpload, pos);
        return true;
      },
      transformPastedHTML: (html) => stripForeignImages(html),
      handleKeyDown: (_view, event) => {
        if (
          onSubmitShortcut &&
          event.key === "Enter" &&
          (event.metaKey || event.ctrlKey)
        ) {
          event.preventDefault();
          onSubmitShortcut();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => onChange(editor.isEmpty ? "" : editor.getHTML()),
  });

  return (
    <div
      data-invalid={invalid || undefined}
      className={cn(
        "overflow-hidden rounded-lg border border-input bg-transparent transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 data-[invalid]:border-destructive data-[invalid]:ring-destructive/20 dark:bg-input/30",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
    >
      <Toolbar
        editor={editor}
        onPickImages={
          canUploadImages
            ? (files) =>
                insertImages(
                  editor.view,
                  files,
                  uploadRef.current!,
                  trackUpload,
                )
            : undefined
        }
      />
      <EditorContent editor={editor} />
    </div>
  );
}

function ToolbarButton({
  icon: Icon,
  label,
  active,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      // Keep the editor selection when clicking the toolbar
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(active && "bg-muted text-foreground")}
    >
      <Icon />
    </Button>
  );
}

function Toolbar({
  editor,
  onPickImages,
}: {
  editor: Editor;
  onPickImages?: (files: File[]) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bulletList: e.isActive("bulletList"),
      orderedList: e.isActive("orderedList"),
      blockquote: e.isActive("blockquote"),
      codeBlock: e.isActive("codeBlock"),
      link: e.isActive("link"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  const chain = () => editor.chain().focus();

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="flex flex-wrap items-center gap-0.5 border-b bg-muted/40 px-1.5 py-1"
    >
      <ToolbarButton
        icon={BoldIcon}
        label="Bold (Ctrl+B)"
        active={state.bold}
        onClick={() => chain().toggleBold().run()}
      />
      <ToolbarButton
        icon={ItalicIcon}
        label="Italic (Ctrl+I)"
        active={state.italic}
        onClick={() => chain().toggleItalic().run()}
      />
      <ToolbarButton
        icon={UnderlineIcon}
        label="Underline (Ctrl+U)"
        active={state.underline}
        onClick={() => chain().toggleUnderline().run()}
      />
      <ToolbarButton
        icon={StrikethroughIcon}
        label="Strikethrough"
        active={state.strike}
        onClick={() => chain().toggleStrike().run()}
      />
      <ToolbarButton
        icon={CodeIcon}
        label="Inline code"
        active={state.code}
        onClick={() => chain().toggleCode().run()}
      />
      <LinkButton editor={editor} active={state.link} />

      <Separator
        orientation="vertical"
        className="mx-1 data-[orientation=vertical]:h-4"
      />

      <ToolbarButton
        icon={Heading2Icon}
        label="Heading"
        active={state.h2}
        onClick={() => chain().toggleHeading({ level: 2 }).run()}
      />
      <ToolbarButton
        icon={Heading3Icon}
        label="Subheading"
        active={state.h3}
        onClick={() => chain().toggleHeading({ level: 3 }).run()}
      />
      <ToolbarButton
        icon={ListIcon}
        label="Bullet list"
        active={state.bulletList}
        onClick={() => chain().toggleBulletList().run()}
      />
      <ToolbarButton
        icon={ListOrderedIcon}
        label="Numbered list"
        active={state.orderedList}
        onClick={() => chain().toggleOrderedList().run()}
      />
      <ToolbarButton
        icon={QuoteIcon}
        label="Quote"
        active={state.blockquote}
        onClick={() => chain().toggleBlockquote().run()}
      />
      <ToolbarButton
        icon={SquareCodeIcon}
        label="Code block"
        active={state.codeBlock}
        onClick={() => chain().toggleCodeBlock().run()}
      />
      {onPickImages && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_IMAGE_TYPES}
            className="sr-only"
            tabIndex={-1}
            onChange={(event) => {
              const files = imageFilesIn(event.target.files);
              event.target.value = "";
              if (files.length > 0) onPickImages(files);
            }}
          />
          <ToolbarButton
            icon={ImageIcon}
            label="Insert image (or paste one)"
            onClick={() => fileInputRef.current?.click()}
          />
        </>
      )}

      <div className="ml-auto flex gap-0.5">
        <ToolbarButton
          icon={Undo2Icon}
          label="Undo (Ctrl+Z)"
          disabled={!state.canUndo}
          onClick={() => chain().undo().run()}
        />
        <ToolbarButton
          icon={Redo2Icon}
          label="Redo (Ctrl+Shift+Z)"
          disabled={!state.canRedo}
          onClick={() => chain().redo().run()}
        />
      </div>
    </div>
  );
}

function LinkButton({ editor, active }: { editor: Editor; active: boolean }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");

  const handleOpenChange = (next: boolean) => {
    if (next) setUrl(editor.getAttributes("link").href ?? "");
    setOpen(next);
  };

  const apply = (event: FormEvent) => {
    event.preventDefault();
    const href = url.trim();
    const chain = editor.chain().focus().extendMarkRange("link");
    if (!href) {
      chain.unsetLink().run();
    } else {
      const safe = /^(https?:|mailto:)/i.test(href) ? href : `https://${href}`;
      chain.setLink({ href: safe }).run();
    }
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          title="Link"
          aria-label="Link"
          aria-pressed={active}
          onMouseDown={(event) => event.preventDefault()}
          className={cn(active && "bg-muted text-foreground")}
        >
          <LinkIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <form onSubmit={apply} className="flex gap-2">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            aria-label="Link URL"
            autoFocus
          />
          <Button type="submit" size="sm">
            {url.trim() ? "Apply" : "Remove"}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
