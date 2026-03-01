// vite.config.js - Конфигурация Vite
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true  // Разрешает доступ из сети
  }
});
