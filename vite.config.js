import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so the build works whether it's hosted at
// https://<user>.github.io/ or https://<user>.github.io/<repo>/
export default defineConfig({
  plugins: [react()],
  base: "./",
});
