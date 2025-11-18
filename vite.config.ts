import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // This allows us to access VITE_API_KEY from the environment during the build.
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    define: {
      // Pass the API key from the build environment to the client-side code.
      // It prioritizes VITE_API_KEY set in Cloud Run or .env files.
      'process.env.API_KEY': JSON.stringify(env.VITE_API_KEY || process.env.VITE_API_KEY),
      'import.meta.env.VITE_API_KEY': JSON.stringify(env.VITE_API_KEY || process.env.VITE_API_KEY),
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
  }
})