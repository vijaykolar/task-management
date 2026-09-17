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
  "img",
];

/** Mirrors UPLOADED_IMAGE_PATTERN in backend/src/utils/rich-text.ts */
const UPLOADED_IMAGE_PATTERN =
  /^https?:\/\/[^\s"'<>]+\/images\/\d+-[0-9a-f]{16}\.(png|jpe?g|gif|webp)$/i;

/** True for images uploaded to the API (the only ones rich text keeps) */
export function isUploadedImageUrl(src: string) {
  return UPLOADED_IMAGE_PATTERN.test(src);
}

export function sanitizeRichText(html: string) {
  const fragment = DOMPurify.sanitize(html, {
    RETURN_DOM_FRAGMENT: true,
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
      "src",
      "alt",
    ],
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:)/i,
  });
  // Only images uploaded to the API are kept, as on the server
  for (const image of fragment.querySelectorAll("img")) {
    if (!isUploadedImageUrl(image.getAttribute("src") ?? "")) image.remove();
  }
  const container = document.createElement("div");
  container.append(fragment);
  return container.innerHTML;
}

/** Visible text of an HTML string (block elements become line breaks) */
export function richTextToPlainText(html: string) {
  const doc = new DOMParser().parseFromString(
    html.replace(/<\/(p|h[1-6]|li|blockquote|pre)>|<br\s*\/?>/gi, "$&\n"),
    "text/html",
  );
  return (doc.body.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim();
}

/** No visible text and no images */
export function isRichTextEmpty(html: string) {
  return richTextToPlainText(html).length === 0 && !/<img\s/i.test(html);
}
