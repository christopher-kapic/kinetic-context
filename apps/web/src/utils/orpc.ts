import type { AppRouterClient } from "@kinetic-context/api/routers/index";

import { env } from "@kinetic-context/env/web";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      toast.error(`Error: ${error.message}`, {
        action: {
          label: "retry",
          onClick: query.invalidate,
        },
      });
    },
  }),
});

// In production, use current origin since web app and API are on same origin
// In development, use the configured server URL
export const link = new RPCLink({
  url: () => {
    if (import.meta.env.PROD) {
      // Production: use current origin since web app and API are served from same origin
      if (typeof window === 'undefined') {
        throw new Error('RPCLink is not allowed on the server side.')
      }
      return `${window.location.origin}/rpc`;
    }
    // Development: use configured server URL or default to localhost:3000
    // Check import.meta.env directly to avoid validation errors when optional
    const serverUrl = (import.meta.env as any).VITE_SERVER_URL || "http://localhost:3000";
    return `${serverUrl}/rpc`;
  },
});

export const client: AppRouterClient = createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);

// Export client for direct calls when needed (e.g., outside of React hooks)
export { client as orpcClient };
