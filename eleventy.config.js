import path from "node:path";
import EleventyVitePlugin from "@11ty/eleventy-plugin-vite";

export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "src/images": "images" });
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "src/sw.js": "sw.js" });

  eleventyConfig.addPlugin(EleventyVitePlugin, {
    viteOptions: {
      clearScreen: false,
      appType: "mpa",
      server: {
        middlewareMode: true
      },
      resolve: {
        alias: {
          "/node_modules": path.resolve(".", "node_modules")
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
