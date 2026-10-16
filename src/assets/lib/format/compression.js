export function parseJsonKeepingBigInts(text) {
  let out = "";
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (ch === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
      continue;
    }

    if (ch === "-" || (ch >= "0" && ch <= "9")) {
      let j = i + 1;
      while (j < text.length && /[0-9.eE+-]/.test(text[j])) j++;
      const token = text.slice(i, j);
      out += /^-?\d{16,}$/.test(token) ? `"${token}"` : token;
      i = j;
      continue;
    }

    out += ch;
    i++;
  }

  return JSON.parse(out);
}

export async function decompressZlib(base64Str) {
  const cleanB64 = base64Str.replace(/\s+/g, "");
  const binStr = atob(cleanB64);
  const bytes = Uint8Array.from(binStr, (c) => c.charCodeAt(0));

  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream("deflate"));

  const jsonText = await new Response(stream).text();
  return parseJsonKeepingBigInts(jsonText);
}
