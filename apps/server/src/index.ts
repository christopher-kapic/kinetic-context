import { createContext } from "@kinetic-context/api/context";
import { appRouter } from "@kinetic-context/api/routers/index";
import { env } from "@kinetic-context/env/server";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { proxy } from "hono/proxy";
import { serveStatic } from "hono/serve-static";
import { StreamableHTTPTransport } from "@hono/mcp";
import { createMcpServer } from "./mcp/index.js";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { logger as appLogger } from "./utils/logger.js";

const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
  }),
);

export const apiHandler = new OpenAPIHandler(appRouter, {
  plugins: [
    new OpenAPIReferencePlugin({
      schemaConverters: [new ZodToJsonSchemaConverter()],
    }),
  ],
  interceptors: [
    onError((error) => {
      appLogger.error("[server]", error);
    }),
  ],
});

export const rpcHandler = new RPCHandler(appRouter, {
  interceptors: [
    onError((error) => {
      appLogger.error("[server]", error);
    }),
  ],
});

// Initialize MCP server
const mcpServer = createMcpServer();
const mcpTransport = new StreamableHTTPTransport();

// Connect MCP server to transport (lazy connection on first request)
let mcpConnected = false;
async function ensureMcpConnected() {
  if (!mcpConnected) {
    await mcpServer.connect(mcpTransport);
    mcpConnected = true;
  }
}

// MCP endpoint
app.all("/mcp", async (c) => {
  await ensureMcpConnected();
  return mcpTransport.handleRequest(c);
});

// API routes
app.use("/*", async (c, next) => {
  const context = await createContext({ context: c });

  const rpcResult = await rpcHandler.handle(c.req.raw, {
    prefix: "/rpc",
    context: context,
  });

  if (rpcResult.matched) {
    return c.newResponse(rpcResult.response.body, rpcResult.response);
  }

  const apiResult = await apiHandler.handle(c.req.raw, {
    prefix: "/api-reference",
    context: context,
  });

  if (apiResult.matched) {
    return c.newResponse(apiResult.response.body, apiResult.response);
  }

  await next();
});

// Serve web app - proxy to Vite dev server in development, serve static files in production
const isDev = env.NODE_ENV === "development";
const webDistPath = join(process.cwd(), "apps", "web", "dist");

if (isDev) {
  // In development, proxy to Vite dev server (port 3001)
  app.use("/*", async (c, next) => {
    // Only proxy if not already handled by API routes
    if (
      !c.req.path.startsWith("/rpc") &&
      !c.req.path.startsWith("/api-reference") &&
      !c.req.path.startsWith("/mcp")
    ) {
      const url = new URL(c.req.raw.url);
      url.host = "localhost:3001";
      url.protocol = "http:";
      return proxy(url.toString(), {
        raw: c.req.raw,
        headers: {
          ...c.req.header(),
          "X-Forwarded-For": c.req.header("x-forwarded-for") || "127.0.0.1",
          "X-Forwarded-Host": c.req.header("host") || "localhost:3000",
        },
      });
    }
    await next();
  });
} else {
  // In production, serve static files
  if (existsSync(webDistPath)) {
    app.use(
      "/*",
      serveStatic({
        root: webDistPath,
        getContent: async (path) => {
          try {
            const stats = await stat(path);
            if (stats.isDirectory()) {
              return null;
            }
            const content = await readFile(path);
            return content;
          } catch {
            return null;
          }
        },
        isDir: async (path) => {
          try {
            const stats = await stat(path);
            return stats.isDirectory();
          } catch {
            return false;
          }
        },
        rewriteRequestPath: (path) => {
          // If path doesn't have an extension, serve index.html for SPA routing
          if (!path.includes(".") || path.endsWith("/")) {
            return "/index.html";
          }
          return path;
        },
      }),
    );
  } else {
    // Fallback if dist doesn't exist
    app.get("/", (c) => {
      return c.text("Web app not built. Run 'pnpm run build' first.");
    });
  }
}

import { serve } from "@hono/node-server";

serve(
  {
    fetch: app.fetch,
    port: 3000,
  },
  (info) => {
    appLogger.log("[server]", `Server is running on http://localhost:${info.port}`);
  },
);
