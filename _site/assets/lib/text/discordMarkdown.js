import { escapeHtml } from "../security/html.js";
import { safeLink } from "../security/url.js";
import hljs from "highlight.js/lib/common";

export function renderDiscordMarkdownToHtml(input) {
  const raw = String(input ?? "").replace(/\r\n?/g, "\n");
  if (!raw) return "";

  let s = escapeHtml(raw);

  const blocks = [];
  const inlines = [];
  const links = [];
  const escapes = [];

  const put = (store, prefix, value) => {
    const idx = store.length;
    store.push(value);
    return `\u0000${prefix}${idx}\u0000`;
  };

  const makeLinkHtml = (text, url) => {
    const safe = safeLink(url);
    if (!safe) return text;
    return `<a class="prev-link" href="${safe}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  };

  s = s.replace(/\\([\\`*_~|>\[\]()#+\-.!])/g, (_m, ch) => {
    return put(escapes, "ESC", ch);
  });

  s = s.replace(/```(?:([a-z0-9_+\-]+)\n)?([\s\S]*?)```/gi, (_m, lang, code) => {
    const unescaped = code
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    let highlighted;
    if (lang && hljs.getLanguage(lang)) {
      highlighted = hljs.highlight(unescaped, { language: lang }).value;
    } else if (lang) {
      highlighted = hljs.highlightAuto(unescaped).value;
    } else {
      highlighted = escapeHtml(unescaped);
    }
    const langAttr = lang ? ` data-lang="${lang}"` : "";
    return put(
      blocks,
      "BLOCK",
      `<pre class="md-pre"${langAttr}><code class="hljs">${highlighted}</code></pre>`
    );
  });

  s = s.replace(/`([^`\n]+)`/g, (_m, code) => {
    return put(inlines, "INLINE", `<code class="md-code">${code}</code>`);
  });

  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi, (_m, text, url) => {
    return put(links, "LINK", makeLinkHtml(text, url));
  });

  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<]+)/gi, (_m, prefix, url) => {
    const cleanUrl = url.replace(/[),.!?]+$/, "");
    const tail = url.slice(cleanUrl.length);
    return `${prefix}${put(links, "LINK", makeLinkHtml(cleanUrl, cleanUrl))}${tail}`;
  });

  s = s.replace(/[*_]{1,3}(\u0000BLOCK\d+\u0000)[*_]{1,3}/g, "$1");

  s = s.replace(/\*\*\*([\s\S]+?)\*\*\*/g, `<strong><em>$1</em></strong>`);
  s = s.replace(/___([\s\S]+?)___/g, `<u><em>$1</em></u>`);
  s = s.replace(/\|\|([\s\S]+?)\|\|/g, `<span class="md-spoiler">$1</span>`);
  s = s.replace(/\*\*([\s\S]+?)\*\*/g, `<strong>$1</strong>`);
  s = s.replace(/__([\s\S]+?)__/g, `<u>$1</u>`);
  s = s.replace(/~~([\s\S]+?)~~/g, `<s>$1</s>`);

  s = s.replace(
    /(^|[\s([{>])\*([^*\n](?:[\s\S]*?[^*\n])?)\*(?=[\s)\]}>.,!?]|$)/g,
    `$1<em>$2</em>`
  );

  s = s.replace(
    /(^|[\s([{>])_([^_\n](?:[\s\S]*?[^_\n])?)_(?=[\s)\]}>.,!?]|$)/g,
    `$1<em>$2</em>`
  );

  const lines = s.split("\n");
  const out = [];
  let multiQuote = false;

  for (let line of lines) {
    if (/^\u0000BLOCK\d+\u0000$/.test(line)) {
      out.push(line);
      continue;
    }

    let m;

    if (multiQuote) {
      out.push(`<div class="md-quote">${line || "<br>"}</div>`);
      continue;
    }

    if ((m = line.match(/^&gt;&gt;&gt;\s?(.*)$/))) {
      multiQuote = true;
      out.push(`<div class="md-quote">${m[1] || ""}</div>`);
      continue;
    }

    if ((m = line.match(/^&gt;\s?(.*)$/))) {
      out.push(`<div class="md-quote">${m[1] || ""}</div>`);
      continue;
    }

    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) {
      const level = m[1].length;
      out.push(`<div class="md-h${level}">${m[2]}</div>`);
      continue;
    }

    if ((m = line.match(/^-#\s+(.*)$/))) {
      out.push(`<div class="md-subtext">${m[1]}</div>`);
      continue;
    }

    if ((m = line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/))) {
      out.push(
        `<div class="md-li"><span class="md-li__marker">${m[2]}</span><span class="md-li__text">${m[3]}</span></div>`
      );
      continue;
    }

    out.push(line);
  }

  s = out.join("<br>");

  s = s.replace(/\u0000ESC(\d+)\u0000/g, (_m, i) => escapes[Number(i)] ?? "");
  s = s.replace(/\u0000INLINE(\d+)\u0000/g, (_m, i) => inlines[Number(i)] ?? "");
  s = s.replace(/\u0000BLOCK(\d+)\u0000/g, (_m, i) => blocks[Number(i)] ?? "");
  s = s.replace(/\u0000LINK(\d+)\u0000/g, (_m, i) => links[Number(i)] ?? "");

  return s;
}