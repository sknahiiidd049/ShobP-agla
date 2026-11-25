import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    base: './',
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'copy-static-community-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, 'dist');
          const foldersToCopy = ['assets', 'js', 'supabase'];
          for (const folder of foldersToCopy) {
            const srcFolder = path.resolve(__dirname, folder);
            const destFolder = path.resolve(distDir, folder);
            if (fs.existsSync(distDir) && fs.existsSync(srcFolder)) {
              fs.cpSync(srcFolder, destFolder, {recursive: true, force: true});
            }
          }
          const styleSrc = path.resolve(__dirname, 'style.css');
          const styleDest = path.resolve(distDir, 'style.css');
          if (fs.existsSync(distDir) && fs.existsSync(styleSrc)) {
            fs.copyFileSync(styleSrc, styleDest);
          }
        },
      },
    ],
    build: {
      rollupOptions: {
        external: (id) => /^https?:\/\//.test(id),
        input: {
          main: path.resolve(__dirname, 'index.html'),
          admin: path.resolve(__dirname, 'admin/index.html'),
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
