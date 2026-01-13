import type { RouterClient } from "@orpc/server";

import { publicProcedure } from "../index";
import { projectsRouter } from "./projects";
import { packagesRouter } from "./packages";
import { statsRouter } from "./stats";
import { configRouter } from "./config";

export const appRouter = {
  healthCheck: publicProcedure.handler(() => {
    return "OK";
  }),
  projects: projectsRouter,
  packages: packagesRouter,
  stats: statsRouter,
  config: configRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
