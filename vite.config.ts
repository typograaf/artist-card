import { defineConfig } from "vite";

// Built for GitHub Pages under a project path, so assets resolve relatively.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "./" : "/",
}));
