import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const removeGzEncodingPlugin = () => {
  return {
    name: 'remove-gz-encoding',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        if (req.url && req.url.endsWith('.gz')) {
          const originalSetHeader = res.setHeader;
          res.setHeader = function (this: any, name: any, value: any) {
            if (name.toLowerCase() === 'content-encoding' && value === 'gzip') {
              return;
            }
            return originalSetHeader.apply(this, arguments as any);
          };
        }
        next();
      });
    },
  };
};

// https://vite.dev/config/
export default defineConfig({
  base: '/omnistrand/',
  plugins: [
    react(),
    tailwindcss(),
    removeGzEncodingPlugin(),
  ],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  }
})
