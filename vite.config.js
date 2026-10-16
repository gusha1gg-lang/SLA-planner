import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Прокси API → FastAPI. Порт берётся из переменной окружения API_PORT: по умолчанию 8000,
// но если :8000 занят чужим сервисом (например, Django PortalProstoev) — поднимаем бэкенд на
// 8001 и запускаем vite как `API_PORT=8001 npm run dev` (скрипт dev-env-up делает это сам).
const apiPort = process.env.API_PORT || 8000;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
    hmr: {
      port: 3000,
    },
    // Proxy API requests to FastAPI backend
    proxy: {
      '/api': {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
      },
      '/health': {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
});
