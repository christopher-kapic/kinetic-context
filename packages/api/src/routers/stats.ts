import { publicProcedure } from "../index";
import { env } from "@kinetic-context/env/server";
import {
  listProjectConfigs,
  listPackageConfigs,
} from "@kinetic-context/server-utils";

export const statsRouter = {
  get: publicProcedure.handler(async () => {
    const [projects, packages] = await Promise.all([
      listProjectConfigs(env.PROJECTS_DIR),
      listPackageConfigs(env.PACKAGES_DIR),
    ]);

    return {
      projects: projects.length,
      packages: packages.length,
    };
  }),
};
