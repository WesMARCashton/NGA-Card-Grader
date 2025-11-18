import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // This ensures process.env.API_KEY is available in the client code.
    // It prefers the environment variable at build time.
    'process.env.API_KEY': JSON.stringify(process.env.API_KEY),
    // Also expose it via import.meta.env for standard Vite patterns if needed
    'import.meta.env.VITE_API_KEY': JSON.stringify(process.env.API_KEY),
  },
  server: {
    host: '0.0.0.0',
    port: 8080,
  },
  preview: {
    host: '0.0.0.0',
    port: process.env.PORT ? Number(process.env.PORT) : 8080,
    allowedHosts: true,
  },
})