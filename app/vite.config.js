import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Dev: Vite serves the app and forwards /maps, /data and /api to server.py (the only thing that writes files).
// server.py only accepts writes whose Origin is its own, so the proxy presents that origin.
const server = process.env.SHEETS_MAP_SERVER || 'http://127.0.0.1:8000';
const toServer = { target: server, configure: (p) => p.on('proxyReq', (req) => req.getHeader('origin') && req.setHeader('origin', server)) };

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  server: { port: 5174, proxy: { '/maps': toServer, '/data': toServer, '/api': toServer } },
  build: { outDir: 'dist' },
});
