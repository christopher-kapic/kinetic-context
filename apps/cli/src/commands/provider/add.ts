import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { client } from "../../client.js";

const PROVIDER_PRESETS = [
  {
    id: "openrouter",
    npm: "@openrouter/ai-sdk-provider",
    name: "OpenRouter",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
  },
  {
    id: "opencode",
    npm: "@ai-sdk/openai-compatible",
    name: "OpenCode Zen",
    defaultBaseUrl: "https://opencode.ai/zen/v1",
  },
  {
    id: "custom",
    npm: "",
    name: "",
    defaultBaseUrl: "",
  },
] as const;

export const providerAddCommand = defineCommand({
  meta: { name: "add", description: "Add a new provider" },
  async run() {
    p.intro(pc.bgCyan(pc.black(" Add Provider ")));

    const providerType = await p.select({
      message: "Provider type",
      options: [
        { value: "openrouter" as const, label: "OpenRouter" },
        { value: "opencode" as const, label: "OpenCode Zen" },
        { value: "custom" as const, label: "Custom (OpenAI-compatible)" },
      ],
    });
    if (p.isCancel(providerType)) {
      p.cancel("Cancelled.");
      return;
    }

    const preset = PROVIDER_PRESETS.find((p) => p.id === providerType)!;

    let providerId: string = preset.id;
    let providerNpm: string = preset.npm;
    let providerName: string = preset.name;

    if (providerType === "custom") {
      const customValues = await p.group(
        {
          id: () =>
            p.text({
              message: "Provider ID",
              placeholder: "e.g. my-provider",
              validate: (v) => (v.length === 0 ? "Required" : undefined),
            }),
          npm: () =>
            p.text({
              message: "NPM package",
              placeholder: "e.g. @ai-sdk/openai-compatible",
              validate: (v) => (v.length === 0 ? "Required" : undefined),
            }),
        },
        {
          onCancel: () => {
            p.cancel("Cancelled.");
            process.exit(0);
          },
        },
      );
      providerId = customValues.id;
      providerNpm = customValues.npm;
      providerName = customValues.id;
    }

    const apiKey = await p.password({ message: "API key" });
    if (p.isCancel(apiKey)) {
      p.cancel("Cancelled.");
      return;
    }

    const baseUrl = await p.text({
      message: "Base URL",
      defaultValue: preset.defaultBaseUrl || undefined,
      initialValue: preset.defaultBaseUrl || undefined,
      placeholder: preset.defaultBaseUrl || "https://...",
    });
    if (p.isCancel(baseUrl)) {
      p.cancel("Cancelled.");
      return;
    }

    // Collect models
    const models: Record<string, { name: string }> = {};
    p.log.info("Add models (leave blank to finish)");

    let addingModels = true;
    while (addingModels) {
      const modelId = await p.text({
        message: "Model ID (blank to finish)",
        defaultValue: "",
      });
      if (p.isCancel(modelId)) break;
      if (!modelId) {
        addingModels = false;
        break;
      }
      models[modelId] = { name: modelId };
      p.log.step(`Added: ${modelId}`);
    }

    let defaultModel: string | undefined;
    const modelIds = Object.keys(models);
    if (modelIds.length > 0) {
      const selected = await p.select({
        message: "Default model",
        options: [
          { value: "", label: "(none)" },
          ...modelIds.map((id) => ({ value: id, label: id })),
        ],
      });
      if (!p.isCancel(selected) && selected) {
        defaultModel = `${providerId}/${selected}`;
      }
    }

    const confirmed = await p.confirm({ message: "Add this provider?" });
    if (p.isCancel(confirmed) || !confirmed) {
      p.cancel("Cancelled.");
      return;
    }

    const s = p.spinner();
    s.start("Saving provider...");

    try {
      // Get current config
      const currentConfig = (await client.config.get()) as Record<string, unknown> | null;

      const config: Record<string, unknown> = currentConfig
        ? { ...currentConfig }
        : {};

      // Ensure provider object exists
      const providers = (config["provider"] as Record<string, unknown>) ?? {};
      providers[providerId] = {
        npm: providerNpm,
        name: providerName,
        options: { baseURL: baseUrl, apiKey },
        models,
      };
      config["provider"] = providers;

      if (defaultModel) {
        config["model"] = defaultModel;
      }

      await client.config.update({ config });
      s.stop("Provider saved!");
    } catch (err) {
      s.stop("Failed to save provider.", 1);
      p.log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }

    p.outro("Done");
  },
});
