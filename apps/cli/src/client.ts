import type { AppRouterClient } from "@kinetic-context/api/routers/index";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { API_BASE } from "./constants.js";

const link = new RPCLink({ url: API_BASE });

export const client: AppRouterClient = createORPCClient(link);
