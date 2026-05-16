import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    tailwindcss(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tanstackStart({ target: "vercel" } as any),
    react(),
    tsconfigPaths(),
  ],
  server: {
    port: 8080,
    host: "::",
  },
});
