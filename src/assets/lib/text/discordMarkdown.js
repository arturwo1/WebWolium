import { escapeHtml } from "../security/html.js";
import { safeLink } from "../security/url.js";

export function renderDiscordMarkdownToHtml(input) {
  const raw = String(input ?? "");
  if (!raw) return "";

  let s = escapeHtml(raw);

  const blocks = [];
  s = s.replace(/```([\s\S]*?)```/g, (_m, code) => {
    const idx = blocks.length;
    blocks.push(code);
    return `\u0000BLOCK${idx}\u0000`;
  });

  const inlines = [];
  s = s.replace(/`([^`\n]+)`/g, (_m, code) => {
    const idx = inlines.length;
    inlines.push(code);
    return `\u0000INLINE${idx}\u0000`;
  });

  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, url) => {
    const safe = safeLink(url);
    if (!safe) return text;
    return `<a class="prev-link" href="${safe}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  });

  s = s.replace(/\|\|([\s\S]+?)\|\|/g, `<span class="md-spoiler">$1</span>`);
  s = s.replace(/\*\*([\s\S]+?)\*\*/g, `<strong>$1</strong>`);
  s = s.replace(/__([\s\S]+?)__/g, `<u>$1</u>`);
  s = s.replace(/~~([\s\S]+?)~~/g, `<s>$1</s>`);
  s = s.replace(/(\*|_)([^*_][\s\S]*?)\1/g, `<em>$2</em>`);
  s = s.replace(/\n/g, "<br>");

  s = s.replace(/\u0000INLINE(\d+)\u0000/g, (_m, i) => {
    const code = inlines[Number(i)] ?? "";
    return `<code class="md-code">${code}</code>`;
  });

  s = s.replace(/\u0000BLOCK(\d+)\u0000/g, (_m, i) => {
    const code = blocks[Number(i)] ?? "";
    return `<pre class="md-pre"><code>${code}</code></pre>`;
  });

  return s;
}
