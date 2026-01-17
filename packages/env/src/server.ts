import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    CORS_ORIGIN: z.url(),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PACKAGES_DIR: z.string().default("/data/packages"),
    LOCAL_PACKAGES_DIR: z.string().default("/data/local-packages"),
    PROJECTS_DIR: z.string().default("/data/projects"),
    CONTEXT_DIR: z.string().optional(),
    OPENCODE_CONFIG_PATH: z.string().default("/config/opencode.json"),
    OPENCODE_STATE_DIR: z.string().default("/state"),
    OPENCODE_URL: z.string().url().default("http://opencode:4096"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
