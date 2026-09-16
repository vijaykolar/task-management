import type {
  SuggestionKeyDownProps,
  SuggestionProps,
} from "@tiptap/suggestion";
import {
  forwardRef,
  useImperativeHandle,
  useState,
  type ForwardedRef,
} from "react";

import { UserAvatar } from "@/components/common/user-avatar";
import { cn } from "@/lib/utils";
import type { UserSummary } from "@/types/models";

export interface MentionItem {
  /** User id, stored in the comment HTML */
  id: string;
  /** Username, shown as @label */
  label: string;
  user: UserSummary;
}

export interface MentionListHandle {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

type MentionListProps = SuggestionProps<
  MentionItem,
  { id: string; label: string }
>;

/** The @mention suggestion popup */
export const MentionList = forwardRef(function MentionList(
  { items, command }: MentionListProps,
  ref: ForwardedRef<MentionListHandle>,
) {
  const [selected, setSelected] = useState(0);
  // Keep the highlight valid when the list shrinks while typing
  const index = Math.min(selected, Math.max(items.length - 1, 0));

  const choose = (item: MentionItem | undefined) => {
    if (item) command({ id: item.id, label: item.label });
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === "ArrowDown") {
        setSelected((index + 1) % Math.max(items.length, 1));
        return true;
      }
      if (event.key === "ArrowUp") {
        setSelected((index - 1 + items.length) % Math.max(items.length, 1));
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        choose(items[index]);
        return items.length > 0;
      }
      return false;
    },
  }));

  return (
    <div
      role="listbox"
      aria-label="Mention a teammate"
      className="w-64 overflow-hidden rounded-lg border bg-popover p-1 text-sm text-popover-foreground shadow-md"
    >
      {items.length === 0 ? (
        <p className="px-2 py-1.5 text-muted-foreground">No matching members</p>
      ) : (
        items.map((item, i) => (
          <button
            key={item.id}
            type="button"
            role="option"
            aria-selected={i === index}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left",
              i === index && "bg-accent text-accent-foreground",
            )}
            // mousedown keeps focus (and the selection) in the editor
            onMouseDown={(event) => {
              event.preventDefault();
              choose(item);
            }}
            onMouseEnter={() => setSelected(i)}
          >
            <UserAvatar user={item.user} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">
                {item.user.fullName?.trim() || item.user.username}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                @{item.user.username}
              </span>
            </span>
          </button>
        ))
      )}
    </div>
  );
});
