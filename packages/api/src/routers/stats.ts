import { publicProcedure } from "../index";
import { env } from "@kinetic-context/env/server";
// Note: These imports use relative paths because server utils aren't in a package
import {
  listProjectConfigs,
  listPackageConfigs,
} from "../../../../apps/server/src/utils/config";

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
