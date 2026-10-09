import sanitizeHtml from "sanitize-html";
import postcss, { type ChildNode, type Declaration } from "postcss";

const PROPERTIES = new Set([
  "background", "background-color", "border", "border-color", "border-radius", "border-style", "border-width",
  "box-shadow", "box-sizing", "color", "display", "flex", "flex-basis", "flex-direction", "flex-grow", "flex-shrink", "flex-wrap",
  "align-items", "align-self", "justify-content", "gap", "grid", "grid-template-columns", "grid-template-rows", "grid-column", "grid-row",
  "font", "font-family", "font-size", "font-style", "font-weight", "letter-spacing", "line-height", "text-align", "text-decoration",
  "text-transform", "white-space", "word-break", "width", "height", "min-width", "min-height", "max-width", "max-height",
  "margin", "margin-top", "margin-right", "margin-bottom", "margin-left", "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
  "opacity", "overflow", "overflow-x", "overflow-y", "position", "top", "right", "bottom", "left", "z-index", "transform",
  "transition", "transition-duration", "transition-property", "vertical-align", "object-fit", "aspect-ratio", "list-style", "cursor"
]);

function safeDeclaration(node: Declaration): boolean {
  return PROPERTIES.has(node.prop.toLowerCase()) && !node.important &&
    !/url\s*\(|@import|expression\s*\(|var\s*\(|\\|[<>]/i.test(node.value) && node.value.length < 1000;
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
        if (node.name.toLowerCase() !== "media" || !/^(\s*\(?\s*(max|min)-width\s*:\s*\d+(px|rem)\s*\)?\s*(and\s*\(?\s*(max|min)-width\s*:\s*\d+(px|rem)\s*\)?\s*)?)$/.test(node.params)) node.remove();
        else visit(node.nodes || []);
      } else node.remove();
    }
  }
  visit(root.nodes);
  return root.toString();
}

export function sanitizeGeneratedHtml(raw: string, language: "en" | "ms" = "en"): string {
  if (Buffer.byteLength(raw, "utf8") > 2_000_000 || (raw.match(/</g) || []).length > 12_000) throw new Error("Generated HTML too large");
  const styleSources = [...raw.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)].slice(0, 5).map((match) => match[1]);
  const styles = cleanStylesheets(styleSources.join("\n"));
  const body = sanitizeHtml(raw, {
    allowedTags: ["main", "section", "article", "header", "footer", "nav", "div", "span", "p", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "em", "b", "i", "small", "br", "hr", "ul", "ol", "li", "blockquote", "a", "button"],
    allowedAttributes: { "*": ["class", "id", "title", "role", "aria-label", "aria-hidden", "style", "lang", "dir"], a: ["href"] },
    allowedSchemes: [],
    disallowedTagsMode: "discard",
    transformTags: {
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

export const PAGE_CSP = "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; script-src 'none'; connect-src 'none'; img-src 'none'; font-src 'none'; style-src 'unsafe-inline'; object-src 'none'";
