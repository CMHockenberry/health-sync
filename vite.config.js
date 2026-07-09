import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' uses relative asset paths, so this build works whether it's
// served at a domain root or a GitHub Pages subpath (username.github.io/repo-name/)
// without needing to hardcode the repo name here.
export default defineConfig({
  plugins: [react()],
  base: './',
})
