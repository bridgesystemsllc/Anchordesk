import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    port: 5180,
    // Teams renders the app in an iframe; these hosts must be allowed to frame it.
    headers: {
      'Content-Security-Policy':
        "frame-ancestors 'self' https://teams.microsoft.com https://*.teams.microsoft.com https://*.skype.com",
    },
  },
});
