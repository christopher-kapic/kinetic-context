import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), tanstackRouter({}), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3001,
    strictPort: true,
    hmr: {
      // HMR will work through the proxy
      clientPort: 3000,
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Split node_modules into separate chunks
          if (id.includes("node_modules")) {
            // React and React DOM
            if (id.includes("react") || id.includes("react-dom")) {
              return "react-vendor";
            }
            // TanStack libraries
            if (id.includes("@tanstack")) {
              return "tanstack-vendor";
            }
            // UI libraries
            if (
              id.includes("lucide-react") ||
              id.includes("zod") ||
              id.includes("sonner")
            ) {
              return "ui-vendor";
            }
            // Base UI components
            if (id.includes("@base-ui")) {
              return "base-ui-vendor";
            }
            // Other vendor libraries
            return "vendor";
          }
        },
      },
    },
  },
});
