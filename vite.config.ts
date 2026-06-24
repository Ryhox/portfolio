import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    // Split the big, rarely-changing vendor libraries into their own chunks so
    // the browser caches them across deploys and downloads them in parallel with
    // the app code, instead of shipping one monolithic bundle. Grouped by family
    // (rather than per-package) so related modules stay in one chunk and keep a
    // safe initialization order.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('/three/') || id.includes('/three-stdlib/')) return 'three'
          if (id.includes('@react-three') || id.includes('/postprocessing')) return 'r3f'
          if (id.includes('/react') || id.includes('/scheduler/')) return 'react'
          return 'vendor'
        },
      },
    },
    // three.js alone is large; the vendor split keeps individual chunks reasonable,
    // so quiet the default 500 kB warning rather than have it fire on every build.
    chunkSizeWarningLimit: 900,
  },
})
