import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { handleApiRequest } from "./lib/apiRouter.mjs";

/** Local dev: same /api/* routes as Vercel production */
function marketApiPlugin() {
  return {
    name: "stocksage-market-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/")) return next();
        await handleApiRequest(req, res, { allowedOrigins: "*" });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), marketApiPlugin()],
  server: {
    port: 5173,
    open: true,
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react-is", "recharts"],
  },
});
