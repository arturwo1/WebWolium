export const IMAGES = import.meta.glob("../images/**/*", {
  eager: true,
  query: "?url",
  import: "default"
});

export function img(path) {
  const clean = String(path || "").replace(/^\/+/, "");
  const key = `../images/${clean}`;

  const url = IMAGES[key];
  if (url) return url;

  console.warn("[img] not found:", key);
  return undefined;
}
