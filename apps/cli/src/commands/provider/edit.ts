import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { client } from "../../client.js";

export const providerEditCommand = defineCommand({
  meta: { name: "edit", description: "Edit an existing provider" },
  async run() {
    p.intro(pc.bgCyan(pc.black(" Edit Provider ")));

    const s = p.spinner();
    s.start("Fetching config...");

    let config: Record<string, unknown>;
    try {
      const raw = await client.config.get();
      config = (raw as Record<string, unknown>) ?? {};
    } catch (err) {
      s.stop("Failed to fetch config.", 1);
      p.log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
    s.stop("Config loaded.");

    const providers = (config["provider"] as Record<string, unknown>) ?? {};
    const providerIds = Object.keys(providers);

    if (providerIds.length === 0) {
      p.log.warn("No providers found.");
      return;
    }

    const selected = await p.select({
      message: "Select a provider to edit",
      options: providerIds.map((id) => {
        const prov = providers[id] as Record<string, unknown>;
        return { value: id, label: `${id} (${prov["name"] ?? id})` };
      }),
    });
    if (p.isCancel(selected)) {
      p.cancel("Cancelled.");
      return;
    }

    const current = providers[selected] as Record<string, unknown>;
    const currentOptions = (current["options"] as Record<string, unknown>) ?? {};

    const values = await p.group(
      {
        npm: () =>
          p.text({
            message: "NPM package",
            defaultValue: (current["npm"] as string) ?? "",
            initialValue: (current["npm"] as string) ?? "",
          }),
        name: () =>
          p.text({
            message: "Display name",
            defaultValue: (current["name"] as string) ?? "",
            initialValue: (current["name"] as string) ?? "",
          }),
        baseURL: () =>
          p.text({
            message: "Base URL",
            defaultValue: (currentOptions["baseURL"] as string) ?? "",
            initialValue: (currentOptions["baseURL"] as string) ?? "",
          }),
        apiKey: () =>
          p.password({
            message: "API key (leave blank to keep current)",
          }),
      },
      {
        onCancel: () => {
          p.cancel("Cancelled.");
          process.exit(0);
        },
      },
    );

    const confirmed = await p.confirm({ message: "Save changes?" });
    if (p.isCancel(confirmed) || !confirmed) {
      p.cancel("Cancelled.");
      return;
    }

    s.start("Saving...");
    try {
      const updatedProvider = {
        ...current,
        npm: values.npm,
        name: values.name,
        options: {
          ...currentOptions,
          baseURL: values.baseURL,
          ...(values.apiKey ? { apiKey: values.apiKey } : {}),
        },
      };
      providers[selected] = updatedProvider;
      config["provider"] = providers;

      await client.config.update({ config });
      s.stop("Provider updated!");
    } catch (err) {
      s.stop("Failed to save provider.", 1);
      p.log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }

    p.outro("Done");
  },
});
