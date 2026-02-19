const modules = import.meta.glob("@img/**/*", {
  eager: true,
  query: "?url",
  import: "default"
});

const map = {};

for (const path in modules) {
  const name = path.split("/").pop();
  map[name] = modules[path];
}

export function img(name) {
  const url = map[name];
  if (!url) {
    console.warn("[img] not found:", name);
    return null;
  }
  return url;
}

export const ALL_IMAGES = map;

console.log(Object.keys(map));
