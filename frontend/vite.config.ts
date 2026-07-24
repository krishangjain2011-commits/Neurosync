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
    hmr: process.env.DISABLE_HMR !== 'true',
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
        secure: false,
      },
    },
    // Note: In local dev, Vite serves the frontend, so /api must proxy
    // to the Express backend running on port 3000.
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
});
