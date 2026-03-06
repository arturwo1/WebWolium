import path from "node:path";
import EleventyVitePlugin from "@11ty/eleventy-plugin-vite";
import { eleventyImageTransformPlugin } from "@11ty/eleventy-img";
import { DateTime } from "luxon";

export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addWatchTarget("./src/assets/locales/");

  eleventyConfig.addFilter("date", (value, format = "yyyy-MM-dd") => {
    if (!value) return "";
    const d = value instanceof Date ? value : new Date(value);
    return DateTime.fromJSDate(d, { zone: "utc" }).toFormat(format);
  });

  eleventyConfig.addPlugin(eleventyImageTransformPlugin, {
    extensions: "html",
    formats: ["auto"],
    widths: ["auto"],
    urlPath: "/assets/img/",
    outputDir: "_site/assets/img/",
    filenameFormat: (id, src, width, format) => `${id}.${format}`
  });

  eleventyConfig.addPlugin(EleventyVitePlugin, {
    viteOptions: {
      clearScreen: false,
      appType: "mpa",
      server: {
        middlewareMode: true,
        fs: { allow: [path.resolve(".")] }
      },
      build: {
        emptyOutDir: true,
        manifest: "manifest.json",
        rollupOptions: {
          output: {
            entryFileNames: "assets/[name]-[hash].js",
            chunkFileNames: "assets/chunks/[name]-[hash].js",
            assetFileNames: "assets/[name]-[hash][extname]"
          }
        }
      },
      resolve: {
        alias: {
          "/node_modules": path.resolve(".", "node_modules"),
          "@img": path.resolve(".", "src/images"),
          "@": path.resolve(".", "src/assets")
        }
      }
    }
  });
}

export const config = {
  dir: {
    input: "src",
    includes: "_includes",
    layouts: "_includes/layouts",
    output: "_site"
  }
};