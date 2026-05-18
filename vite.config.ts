import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import fs from 'fs';

// Load shared config
const sharedConfig = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'config.json'), 'utf-8'));

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');

  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    clearScreen: false,
    server: {
      port: sharedConfig.server.frontend_port || 3000,
      strictPort: true,
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${sharedConfig.server.port || 8000}`,
          changeOrigin: true,
        },
      },
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    envPrefix: ['VITE_', 'TAURI_'],
  };
});
