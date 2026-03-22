import { fileURLToPath } from "url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import * as path from "path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const frontendDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(frontendDir, "../..");

  return {
    base: "/myflow_base/static/src",
    publicDir: path.resolve(frontendDir, "public"),
    plugins: [react()],
    server: {
      port: parseInt(env.VITE_PORT || "5371"),
      fs: {
        allow: [repoRoot],
      },
      proxy: {
        "/web": {
          target: "http://localhost:8069",
          changeOrigin: true,
          secure: false,
        },
        "/odoo": {
          target: "http://localhost:8069",
          changeOrigin: true,
          secure: false,
        },
        "/myflow_base/api": {
          target: "http://localhost:8069",
          changeOrigin: true,
          secure: false,
        },
        "/cr_product_configurations/api": {
          target: "http://localhost:8069",
          changeOrigin: true,
          secure: false,
        },
        "/workflow": {
          target: "http://localhost:8069",
          changeOrigin: true,
          secure: false,
        },
      },
    },
    build: {
      outDir: path.resolve(frontendDir, "../static/src"),
      emptyOutDir: true,
      minify: "terser",
      terserOptions: {
        compress: {
          drop_console: false,
          drop_debugger: true,
        },
      },
      cssCodeSplit: false,
      sourcemap: false,
      copyPublicDir: true,
      rollupOptions: {
        input: {
          main: path.resolve(frontendDir, "index.html"),
        },
        output: {
          entryFileNames: "index.js",
          chunkFileNames: "index.js",
          manualChunks: undefined,
          assetFileNames: (assetInfo) => {
            if (assetInfo.name?.endsWith(".css")) {
              return "index.css";
            }
            return "[name].[ext]";
          },
          format: "es",
          dir: "../static/src",
        },
      },
    },
  };
});
