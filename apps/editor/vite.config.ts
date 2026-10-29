import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const target = `http://127.0.0.1:${process.env.CLIPAI_PORT ?? 4400}`;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    proxy: {
      "/api": target,
      "/fonts": target,
      "/plugins": target,
      "/ws": { target: target.replace("http", "ws"), ws: true },
    },
  },
  build: { chunkSizeWarningLimit: 2000 },
});
