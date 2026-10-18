export async function decompressZlib(base64Str) {
  const cleanB64 = base64Str.replace(/\s+/g, "");
  const binStr = atob(cleanB64);
  const bytes = Uint8Array.from(binStr, (c) => c.charCodeAt(0));

  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream("deflate"));

  const jsonText = await new Response(stream).text();
  return JSON.parse(jsonText);
}