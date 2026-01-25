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
    OPENCODE_TIMEOUT_MS: z.coerce.number().default(120000), // 2 minutes, less than opencode's 5-minute provider timeout
    OPENCODE_FETCH_TIMEOUT_MS: z.coerce.number().default(30000), // 30 seconds
    OPENCODE_POLL_INTERVAL_MS: z.coerce.number().default(2000), // 2 seconds
    OPENCODE_MAX_POLL_ATTEMPTS: z.coerce.number().default(30), // 30 attempts = 60 seconds max polling
    OPENCODE_STREAM_HEARTBEAT_MS: z.coerce.number().default(30000), // 30 seconds
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
