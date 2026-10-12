import sanitizeHtml from "sanitize-html";
import postcss, { type ChildNode, type Declaration } from "postcss";

const PROPERTIES = new Set([
  "background", "background-color", "background-image", "background-size", "background-position", "background-repeat", "background-clip", "background-origin",
  "border", "border-color", "border-radius", "border-style", "border-width",
  "box-shadow", "box-sizing", "color", "display", "flex", "flex-basis", "flex-direction", "flex-grow", "flex-shrink", "flex-wrap", "flex-flow", "order",
  "align-items", "align-self", "align-content", "justify-content", "justify-items", "justify-self", "place-items", "place-content",
  "gap", "grid", "grid-template-columns", "grid-template-rows", "grid-column", "grid-row",
  "font", "font-family", "font-size", "font-style", "font-weight", "font-variant", "letter-spacing", "line-height", "text-align", "text-decoration",
  "text-decoration-color", "text-decoration-style", "text-decoration-thickness", "text-underline-offset", "text-shadow", "text-transform",
  "white-space", "word-break", "word-spacing", "vertical-align",
  "width", "height", "min-width", "min-height", "max-width", "max-height", "inset", "float", "clear",
  "margin", "margin-top", "margin-right", "margin-bottom", "margin-left", "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
  "opacity", "overflow", "overflow-x", "overflow-y", "position", "top", "right", "bottom", "left", "z-index",
  "transform", "transform-origin", "transition", "transition-duration", "transition-property", "transition-timing-function", "transition-delay",
  "animation", "animation-name", "animation-duration", "animation-delay", "animation-iteration-count", "animation-direction", "animation-fill-mode", "animation-play-state", "animation-timing-function",
  "filter", "backdrop-filter", "mix-blend-mode", "clip-path", "outline", "outline-color", "outline-offset", "outline-style", "outline-width",
  "object-fit", "object-position", "aspect-ratio", "list-style", "cursor", "will-change"
]);

// url()/expression() stay banned everywhere (including inside custom-property
// values), but var() references are safe: any custom property whose value held
// a banned function was already dropped, so the reference resolves to nothing.
function safeDeclaration(node: Declaration): boolean {
  const prop = node.prop.toLowerCase();
  if (!prop.startsWith("--") && !PROPERTIES.has(prop)) return false;
  return !node.important &&
    !/url\s*\(|@import|expression\s*\(|image\s*\(|\\|[<>]/i.test(node.value) && node.value.length < 1000;
}

function cleanDeclarations(input: string): string {
  try {
    const root = postcss.parse(`x{${input}}`);
    const rule = root.first;
    if (!rule || rule.type !== "rule") return "";
    return (rule.nodes || []).filter((node): node is Declaration => node.type === "decl" && safeDeclaration(node)).map((node) => `${node.prop}:${node.value}`).join(";");
  } catch { return ""; }
}

function cleanStylesheets(input: string): string {
  if (input.length > 150_000) throw new Error("Generated CSS too large");
  const root = postcss.parse(input);
  function visit(nodes: ChildNode[]): void {
    for (const node of [...nodes]) {
      if (node.type === "decl") { if (!safeDeclaration(node)) node.remove(); }
      else if (node.type === "rule") {
        if (node.selector.length > 1000 || /[<>\\]/.test(node.selector)) node.remove();
        else visit(node.nodes || []);
      } else if (node.type === "atrule") {
        const name = node.name.toLowerCase();
        if (name === "keyframes") {
          if (!/^[A-Za-z][\w-]{0,60}$/.test(node.params.trim().replace(/^['"]|['"]$/g, ""))) node.remove();
          else visit(node.nodes || []);
        } else if (name !== "media" || !/^(\s*\(?\s*(max|min)-width\s*:\s*\d+(px|rem)\s*\)?\s*(and\s*\(?\s*(max|min)-width\s*:\s*\d+(px|rem)\s*\)?\s*)?)$/.test(node.params)) node.remove();
        else visit(node.nodes || []);
      } else node.remove();
    }
  }
  visit(root.nodes);
  return root.toString();
}

export interface SanitizeOptions {
  /** When set, the page may embed exactly one image: an <img> whose src equals this first-party attachment URL. */
  attachmentSrc?: string;
}

const BASE_ALLOWED_TAGS = ["main", "section", "article", "header", "footer", "nav", "div", "span", "p", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "em", "b", "i", "small", "br", "hr", "ul", "ol", "li", "blockquote", "a", "button"];

// The attached photo passes through only when its src matches the first-party
// attachment URL exactly; every attribute is rebuilt from this allowlist (the
// prompt's placeholder token, external/data:/protocol-relative srcs, srcset,
// event handlers, and inline styles never survive). Any other <img> becomes an
// empty span.
function attachmentImageTransform(allowedSrc: string) {
  return (tagName: string, attribs: Record<string, string>) => {
    if (attribs.src !== allowedSrc) return { tagName: "span", attribs: {} };
    const next: Record<string, string> = { src: allowedSrc };
    const alt = attribs.alt ? attribs.alt.replace(/[\r\n\t"'<>\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 200) : "";
    if (alt) next.alt = alt;
    if (/^\d{1,4}$/.test(attribs.width || "")) next.width = attribs.width;
    if (/^\d{1,4}$/.test(attribs.height || "")) next.height = attribs.height;
    // Classes only pick styles the CSS allowlist already vetted; keep them
    // tightly validated so nothing else rides along in the attribute.
    const cls = attribs.class ? attribs.class.trim() : "";
    if (cls && /^[\w\s-]{0,300}$/.test(cls)) next.class = cls;
    return { tagName, attribs: next };
  };
}

export function sanitizeGeneratedHtml(raw: string, language: "en" | "ms" = "en", options: SanitizeOptions = {}): string {
  if (Buffer.byteLength(raw, "utf8") > 2_000_000 || (raw.match(/</g) || []).length > 12_000) throw new Error("Generated HTML too large");
  const styleSources = [...raw.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)].slice(0, 5).map((match) => match[1]);
  const styles = cleanStylesheets(styleSources.join("\n"));
  const attachmentSrc = options.attachmentSrc;
  const body = sanitizeHtml(raw, {
    allowedTags: attachmentSrc ? [...BASE_ALLOWED_TAGS, "img"] : BASE_ALLOWED_TAGS,
    allowedAttributes: attachmentSrc
      ? { "*": ["class", "id", "title", "role", "aria-label", "aria-hidden", "style", "lang", "dir"], a: ["href"], img: ["src", "alt", "width", "height", "class"] }
      : { "*": ["class", "id", "title", "role", "aria-label", "aria-hidden", "style", "lang", "dir"], a: ["href"] },
    allowedSchemes: [],
    disallowedTagsMode: "discard",
    // Head-only elements must lose their text too: with plain tag-discard the
    // raw <title> string survives as a stray text node at the top of <body>
    // and renders as visible text (defaults included — specifying replaces).
    nonTextTags: ["style", "script", "textarea", "option", "noscript", "title", "head"],
    transformTags: {
      ...(attachmentSrc ? { img: attachmentImageTransform(attachmentSrc) } : {}),
      "*": (tagName, attribs) => {
        const next = { ...attribs };
        if (next.style) next.style = cleanDeclarations(next.style);
        if (tagName === "a" && (!next.href || !/^#[A-Za-z][\w-]{0,80}$/.test(next.href))) delete next.href;
        return { tagName, attribs: next };
      }
    }
  });
  if (!styles.trim() && !/\bstyle="[^"]+"/.test(body)) throw new Error("Generated design has no supported styling");
  const plainText = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  if (/\b(password|one.time.passcode|credit card|bank login|sign in|log in)\b/i.test(plainText)) throw new Error("Generated content failed safety review");
  if (plainText.trim().length < 40) throw new Error("Generated page has too little safe content");
  return `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>A note for you · Mintamaaf</title><style>*,*::before,*::after{box-sizing:border-box}body{margin:0;min-height:100vh}button{font:inherit}@media(prefers-reduced-motion:reduce){*,*::before,*::after{transition:none!important;animation:none!important}}${styles}</style></head><body>${body}</body></html>`;
}

// 'self' under img-src reaches only this app's own attachment route
// (/api/attachments/{pageId}); every external load stays banned by
// default-src 'none' and the sanitizer's single-allowlisted-src rule.
export const PAGE_CSP = "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; script-src 'none'; connect-src 'none'; img-src 'self'; font-src 'none'; style-src 'unsafe-inline'; object-src 'none'";
