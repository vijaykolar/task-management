import DOMPurify from "dompurify";

// Mirrors backend/src/utils/rich-text.ts. The server sanitizes on save; this
// is defence in depth before injecting HTML into the page.
const ALLOWED_TAGS = [
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
];

export function sanitizeRichText(html: string) {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: [
      "href",
      "target",
      "rel",
      "start",
      "class",
      "data-type",
      "data-id",
      "data-label",
    ],
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:)/i,
  });
}

/** Visible text of an HTML string (block elements become line breaks) */
export function richTextToPlainText(html: string) {
  const doc = new DOMParser().parseFromString(
    html.replace(/<\/(p|h[1-6]|li|blockquote|pre)>|<br\s*\/?>/gi, "$&\n"),
    "text/html",
  );
  return (doc.body.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim();
}

export function isRichTextEmpty(html: string) {
  return richTextToPlainText(html).length === 0;
}
