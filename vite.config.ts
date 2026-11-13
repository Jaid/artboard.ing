import react from '@vitejs/plugin-react'
import {defineConfig} from 'vite'
import mediaMixins from 'vite-plugin-media-mixins'
import title from 'vite-plugin-title'

export default defineConfig({
  plugins: [title(), react(), mediaMixins()],
  // ai and minimatch are only imported lazily by the ai_endpoint code; prebundling them avoids a full reload in the middle of the first request.
  optimizeDeps: {include: ['monacozen', '@jsquash/jxl/decode.js', 'ai', 'minimatch']},
  worker: {format: 'es'},
  server: {
    host: '127.0.0.1',
    watch: {ignored: ['**/out/**', '**/temp/**', '**/dist/**']},
  },
  build: {
    target: 'chrome154',
    minify: 'oxc',
    reportCompressedSize: false,
    chunkSizeWarningLimit: 5000,
  },
})
