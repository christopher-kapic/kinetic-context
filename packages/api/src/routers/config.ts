import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { publicProcedure } from "../index";
import { env } from "@kinetic-context/env/server";
import { dirname } from "node:path";
// Note: These imports use relative paths because server utils aren't in a package
import {
  readOpencodeConfig,
  writeOpencodeConfig,
  readGlobalConfig,
  writeGlobalConfig,
  type OpencodeConfig,
  type GlobalConfig,
} from "../../../../apps/server/src/utils/config";

// List of well-known providers for UI autocomplete
const WELL_KNOWN_PROVIDERS = [
  {
    id: "openrouter",
    name: "OpenRouter",
    npm: "@openrouter/ai-sdk-provider",
    description: "Access multiple AI models through OpenRouter",
  },
  {
    id: "opencode",
    name: "OpenCode Zen",
    npm: "@ai-sdk/openai-compatible",
    description: "Curated AI models from OpenCode Zen",
  },
  {
    id: "github-copilot",
    name: "GitHub Copilot",
    npm: "@ai-sdk/github-copilot",
    description: "Use GitHub Copilot models (auth via /connect command)",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    npm: "@ai-sdk/anthropic",
    description: "Claude models from Anthropic",
  },
  {
    id: "openai",
    name: "OpenAI",
    npm: "@ai-sdk/openai",
    description: "GPT models from OpenAI",
  },
  {
    id: "google",
    name: "Google",
    npm: "@ai-sdk/google",
    description: "Gemini models from Google",
  },
  {
    id: "mistral",
    name: "Mistral",
    npm: "@ai-sdk/mistral",
    description: "Mistral AI models",
  },
  {
    id: "groq",
    name: "Groq",
    npm: "@ai-sdk/groq",
    description: "Fast inference with Groq",
  },
];

// Use a more permissive schema to avoid Zod v4 issues with passthrough and nested records
// The actual validation happens in writeOpencodeConfig
const UpdateConfigInputSchema = z.object({
  config: z.unknown(),
});

export const configRouter = {
  get: publicProcedure.handler(async () => {
    const configPath = env.OPENCODE_CONFIG_PATH;
    const config = await readOpencodeConfig(configPath);
    return config;
  }),

  update: publicProcedure
    .input(UpdateConfigInputSchema)
    .handler(async ({ input }) => {
      const configPath = env.OPENCODE_CONFIG_PATH;
      try {
        await writeOpencodeConfig(configPath, input.config);
        return { success: true };
      } catch (error) {
        throw new ORPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to write config: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  getProviders: publicProcedure.handler(async () => {
    return WELL_KNOWN_PROVIDERS;
  }),

  getSettings: publicProcedure.handler(async () => {
    // PACKAGES_DIR is typically /data/packages, so parent is /data
    const dataDir = dirname(env.PACKAGES_DIR) || "/data";
    const globalConfig = await readGlobalConfig(dataDir);
    return globalConfig;
  }),

  updateSettings: publicProcedure
    .input(
      z.object({
        default_packages_dir: z.string().min(1),
        default_agent_prompt: z.string().optional(),
      }),
    )
    .handler(async ({ input }) => {
      // PACKAGES_DIR is typically /data/packages, so parent is /data
      const dataDir = dirname(env.PACKAGES_DIR) || "/data";
      try {
        await writeGlobalConfig(dataDir, {
          default_packages_dir: input.default_packages_dir,
          default_agent_prompt: input.default_agent_prompt,
        });
        return { success: true };
      } catch (error) {
        throw new ORPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to update settings: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),
};
