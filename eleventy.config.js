import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./src/_build/aliasLoader.mjs", pathToFileURL("./"));

import path from "node:path";
import EleventyVitePlugin from "@11ty/eleventy-plugin-vite";
import { eleventyImageTransformPlugin } from "@11ty/eleventy-img";
import { DateTime } from "luxon";
import { i18nKey } from "./src/_data/i18nKeyBuilder.js";
import { t } from "./src/_data/i18nText.js";

export default function (eleventyConfig) {
  eleventyConfig.setUseGitIgnore(false);
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addWatchTarget("./src/assets/locales/");

  eleventyConfig.addFilter("date", (value, format = "yyyy-MM-dd") => {
    if (!value) return "";
    const d = value instanceof Date ? value : new Date(value);
    return DateTime.fromJSDate(d, { zone: "utc" }).toFormat(format);
  });

  eleventyConfig.addFilter("concat", (arr, item) => {
    return [...(arr || []), item];
  });

  eleventyConfig.addFilter("i18nKeyFilter", (fullPath, section, audience, field) => {
    return i18nKey(section, audience, fullPath, field);
  });

  eleventyConfig.addFilter("t", (key) => t(key));

  eleventyConfig.addFilter("stripSlash", (str) => {
    return typeof str === "string" ? str.replace(/^\//, "") : str;
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
        host: "0.0.0.0",
        middlewareMode: true,
        allowedHosts: true,
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

  eleventyConfig.setServerOptions({
    host: "0.0.0.0",
    port: 8080,
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