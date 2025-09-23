import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3010',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3010',
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
