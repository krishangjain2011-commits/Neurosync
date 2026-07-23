import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    host: true,
    allowedHosts: ['.onrender.com'],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    // Chunk size warning threshold — fine for production
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // Split large vendor libs for better caching
        manualChunks: {
          router: ['react-router-dom'],
          motion: ['framer-motion'],
          charts: ['recharts'],
        },
      },
    },
  },
  server: {
    hmr: process.env.DISABLE_HMR !== 'true',
    // Note: API proxy is disabled in dev mode because the Express server
    // handles both API and frontend in middleware mode on the same port.
    // Vite's dev server doesn't need to proxy /api requests.
  },
});
