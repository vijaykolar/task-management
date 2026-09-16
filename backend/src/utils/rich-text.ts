import sanitizeHtml from "sanitize-html";

/**
 * Tags produced by the frontend editor (Tiptap StarterKit). Anything else —
 * scripts, styles, event handlers, iframes — is stripped before saving.
 */
const RICH_TEXT_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p",
    "br",
    "h1",
    "h2",
    "h3",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "code",
    "pre",
    "blockquote",
    "ul",
    "ol",
    "li",
    "hr",
    "a",
    "span",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    ol: ["start"],
    // @mentions: <span data-type="mention" data-id="<userId>" data-label="name">
    span: ["data-type", "data-id", "data-label", "class"],
  },
  allowedClasses: {
    span: ["mention"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  transformTags: {
    // Links always open safely in a new tab
    a: sanitizeHtml.simpleTransform("a", {
      target: "_blank",
      rel: "noopener noreferrer nofollow",
    }),
  },
};

/** User ids mentioned in sanitized rich text */
export const extractMentionIds = (html: string) => {
  const ids = new Set<string>();
  const pattern =
    /<span[^>]*data-type="mention"[^>]*data-id="([0-9a-f]{24})"|<span[^>]*data-id="([0-9a-f]{24})"[^>]*data-type="mention"/gi;
  for (const match of html.matchAll(pattern)) {
    ids.add((match[1] ?? match[2])!.toLowerCase());
  }
  return [...ids];
};

export const sanitizeRichText = (html: string) =>
  sanitizeHtml(html, RICH_TEXT_OPTIONS).trim();

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

/** Plain text version of rich text, used for search, previews and length limits */
export const richTextToPlainText = (html: string) =>
  sanitizeHtml(
    // Keep line breaks between blocks
    html.replace(/<\/(p|h[1-6]|li|blockquote|pre)>|<br\s*\/?>/gi, "$&\n"),
    { allowedTags: [], allowedAttributes: {} },
  )
    .replace(
      /&(amp|lt|gt|quot|#39|nbsp);/g,
      (entity) => ENTITIES[entity] ?? entity,
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const escapeHtml = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Converts legacy plain text (one paragraph per line) into rich text HTML */
export const plainTextToRichText = (text: string) =>
  text
    .split(/\r?\n/)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");

/** Sanitized HTML plus its plain text, ready to store */
export const prepareRichText = (html: unknown) => {
  const content = sanitizeRichText(typeof html === "string" ? html : "");
  return { html: content, text: richTextToPlainText(content) };
};
