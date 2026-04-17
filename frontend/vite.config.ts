import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: parseInt(process.env.PORT ?? "5173"),
    proxy: {
      "/api": { target: "http://api:8000", changeOrigin: true },
    },
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
