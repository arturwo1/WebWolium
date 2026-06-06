import { defineConfig } from "vite";
import path from "path";
import fs from "fs";

export default defineConfig({
  plugins: [
    {
      name: 'netlify-clean-urls-emulator',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url.includes('.') || req.url.startsWith('/@')) {
            return next();
          }
          const cleanUrl = req.url.split('?')[0]; 
          const absolutePath = path.resolve(process.cwd(), '_site', cleanUrl.substring(1));
          if (fs.existsSync(absolutePath) && fs.statSync(absolutePath).isDirectory()) {
            req.url = cleanUrl + '/index.html' + (req.url.includes('?') ? '?' + req.url.split('?')[1] : '');
          }
          
          next();
        });
      }
    }
  ],
  root: "src",
  base: "/",
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src", "assets"),
      "@img": path.resolve(process.cwd(), "src", "images")
    }
  },
  build: {
    outDir: path.resolve(process.cwd(), "_site"),
    emptyOutDir: false,
    manifest: true,
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
