import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { publicProcedure } from "../index";
import { env } from "@kinetic-context/env/server";
import { dirname } from "node:path";
import {
  readOpencodeConfig,
  writeOpencodeConfig,
  readGlobalConfig,
  writeGlobalConfig,
  type OpencodeConfig,
  type GlobalConfig,
} from "@kinetic-context/server-utils";

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

  fetchOpencodeZenModels: publicProcedure
    .input(
      z.object({
        apiKey: z.string().min(1, "API key is required"),
        baseURL: z.string().url().optional(),
      }),
    )
    .handler(async ({ input }) => {
      const baseURL = input.baseURL || "https://opencode.ai/zen/v1";
      try {
        const response = await fetch(`${baseURL}/models`, {
          headers: {
            Authorization: `Bearer ${input.apiKey}`,
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch models: ${response.statusText}`);
        }

        const data = await response.json();
        if (data.data && Array.isArray(data.data)) {
          return {
            models: data.data.map((model: any) => ({
              id: model.id,
              object: model.object,
              created: model.created,
              owned_by: model.owned_by,
            })),
          };
        } else {
          throw new Error("Invalid response format");
        }
      } catch (error) {
        throw new ORPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to fetch models from OpenCode Zen",
        });
      }
    }),

  startGithubCopilotAuth: publicProcedure
    .input(
      z.object({
        enterpriseUrl: z.string().url().optional().or(z.literal("")),
      }),
    )
    .handler(async () => {
      const opencodeUrl = env.OPENCODE_URL;
      const timeoutMs = env.OPENCODE_FETCH_TIMEOUT_MS;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        const response = await fetch(
          `${opencodeUrl}/provider/github-copilot/oauth/authorize`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ method: 0 }),
            signal: controller.signal,
          },
        );
        clearTimeout(timeoutId);
        if (!response.ok) {
          const text = await response.text();
          throw new Error(`OpenCode auth failed: ${response.status} ${response.statusText}${text ? ` - ${text}` : ""}`);
        }
        const data = (await response.json()) as { url?: string; instructions?: string };
        const url = typeof data.url === "string" ? data.url : "";
        const instructions = typeof data.instructions === "string" ? data.instructions : "Enter the code shown in OpenCode.";
        return { url, instructions };
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw new ORPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "OpenCode server request timed out",
          });
        }
        throw new ORPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "GitHub Copilot auth not available",
        });
      }
    }),

  completeGithubCopilotAuth: publicProcedure.handler(async () => {
    const opencodeUrl = env.OPENCODE_URL;
    const timeoutMs = Math.max(env.OPENCODE_FETCH_TIMEOUT_MS, 120_000);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(
        `${opencodeUrl}/provider/github-copilot/oauth/callback`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ method: 0 }),
          signal: controller.signal,
        },
      );
      clearTimeout(timeoutId);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`OpenCode callback failed: ${response.status} ${response.statusText}${text ? ` - ${text}` : ""}`);
      }
      const result = await response.json();
      return { success: result === true };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new ORPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Authentication timed out. Complete the device flow on GitHub and try again.",
        });
      }
      throw new ORPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error instanceof Error ? error.message : "GitHub Copilot auth failed",
      });
    }
  }),

  fetchGithubCopilotModels: publicProcedure
    .input(
      z.object({
        enterpriseUrl: z.string().url().optional().or(z.literal("")),
      }),
    )
    .handler(async () => {
      const opencodeUrl = env.OPENCODE_URL;
      const timeoutMs = env.OPENCODE_FETCH_TIMEOUT_MS;

      // Curated list from https://docs.github.com/en/copilot/reference/ai-models/supported-models
      // Maintained from upstream docs when OpenCode does not return models.
      const FALLBACK_COPILOT_MODELS = [
        { id: "gpt-5.2-codex", name: "GPT-5.2-Codex" },
        { id: "gpt-5.1-codex", name: "GPT-5.1-Codex" },
        { id: "gpt-5.1-codex-max", name: "GPT-5.1-Codex-Max" },
        { id: "gpt-5.1-codex-mini", name: "GPT-5.1-Codex-Mini" },
        { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" },
        { id: "claude-opus-4-5", name: "Claude Opus 4.5" },
        { id: "claude-haiku-4-5", name: "Claude Haiku 4.5" },
        { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
        { id: "grok-code-fast-1", name: "Grok Code Fast 1" },
      ];

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        const response = await fetch(`${opencodeUrl}/provider`, {
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
          return { models: FALLBACK_COPILOT_MODELS };
        }
        const data = (await response.json()) as {
          all?: Array<{ id?: string; models?: Record<string, { name?: string }> }>;
        };
        const all = data.all ?? [];
        const copilot = all.find((p) => p.id === "github-copilot");
        if (copilot?.models && typeof copilot.models === "object") {
          const models = Object.entries(copilot.models).map(([id, meta]) => ({
            id,
            name: meta?.name ?? id,
          }));
          if (models.length > 0) {
            return { models };
          }
        }
        return { models: FALLBACK_COPILOT_MODELS };
      } catch {
        return { models: FALLBACK_COPILOT_MODELS };
      }
    }),
};
