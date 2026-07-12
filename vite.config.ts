import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
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
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
