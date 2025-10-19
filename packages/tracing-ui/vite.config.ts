import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Build in library mode; entry is src/index.ts
export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'ObsUi',
      formats: ['es']
    },
    rollupOptions: {
      external: ['react', 'react-dom']
    }
  },
  server: {
    port: 5175,
    host: '0.0.0.0'
  }
});
