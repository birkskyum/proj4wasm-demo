import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solidPlugin()],
  server: {
    port: 3000,
    fs: {
      allow: ['..']
    },
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    }
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      external: [],
      output: {
        manualChunks: {
          'proj-wasm': ['proj-wasm']
        }
      }
    }
  },
  optimizeDeps: {
    exclude: ['proj-wasm']
  },
  assetsInclude: ['**/*.wasm'],
  worker: {
    format: 'es'
  },
  define: {
    global: 'globalThis',
  }
});
