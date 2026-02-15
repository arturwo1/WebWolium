import path from "node:path";
import fs from "node:fs";
import EleventyVitePlugin from "@11ty/eleventy-plugin-vite";

function copyFileSafe(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log(`[copy] ${src} -> ${dest}`);
}

export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "src/images": "images" });
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });

  eleventyConfig.addPlugin(EleventyVitePlugin, {
    viteOptions: {
      clearScreen: false,
      appType: "mpa",
      server: { middlewareMode: true },
      build: {
        emptyOutDir: false
      },
      resolve: {
        alias: {
          "/node_modules": path.resolve(".", "node_modules")
        }
      },

      plugins: [
        {
          name: "copy-runtime-files-after-bundle",
          closeBundle() {
            copyFileSafe(
              path.resolve(process.cwd(), "src/sw.js"),
              path.resolve(process.cwd(), "_site/sw.js")
            );
            copyFileSafe(
              path.resolve(process.cwd(), "src/assets/config.js"),
              path.resolve(process.cwd(), "_site/assets/config.js")
            );
          }
        }
      ]
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