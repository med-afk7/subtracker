import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Forward API calls to Express so the auth cookie stays same-origin
    proxy: {
      // API_URL lets a second copy of the app run alongside (e.g. API on another port)
      '/api': process.env.API_URL ?? 'http://localhost:3000',
    },
  },
});
