import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  root: "src",
  base: "/",
  build: {
    outDir: path.resolve(process.cwd(), "_site"),
    emptyOutDir: false,
    rollupOptions: {
      input: {
        app: path.resolve(process.cwd(), "src/assets/app.js")
      },
      output: {
        entryFileNames: "assets/[name].[hash].js",
        chunkFileNames: "assets/chunks/[name].[hash].js",
        assetFileNames: "assets/[name].[hash][extname]"
      }
    }
  }
});
