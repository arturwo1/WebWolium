import path from "node:path";
import { pathToFileURL } from "node:url";

const ASSETS_ROOT = path.resolve(process.cwd(), "src/assets");

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const target = path.join(ASSETS_ROOT, specifier.slice(2));
    return nextResolve(pathToFileURL(target).href, context);
  }

  return nextResolve(specifier, context);
}