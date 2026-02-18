import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { client } from "../../client.js";

export const packageAddCommand = defineCommand({
  meta: { name: "add", description: "Add a new package" },
  async run() {
    p.intro(pc.bgCyan(pc.black(" Add Package ")));

    const values = await p.group(
      {
        storage_type: () =>
          p.select({
            message: "Package type",
            options: [
              { value: "cloned" as const, label: "Cloned", hint: "Clone from git repository" },
              { value: "local" as const, label: "Local", hint: "Use existing local repository" },
            ],
          }),
        identifier: () =>
          p.text({
            message: "Package identifier",
            placeholder: "e.g. @hookform/resolvers",
            validate: (v) => (v.length === 0 ? "Required" : undefined),
          }),
        package_manager: () =>
          p.select({
            message: "Package manager",
            initialValue: "npm",
            options: [
              { value: "npm", label: "npm" },
              { value: "pnpm", label: "pnpm" },
              { value: "yarn", label: "yarn" },
            ],
          }),
        display_name: ({ results }) =>
          p.text({
            message: "Display name",
            defaultValue: results.identifier as string,
            placeholder: results.identifier as string,
          }),
        git_url: ({ results }) =>
          results.storage_type === "cloned"
            ? p.text({
                message: "Git URL",
                validate: (v) => (v.length === 0 ? "Required for cloned packages" : undefined),
              })
            : Promise.resolve(undefined),
        default_tag: ({ results }) =>
          results.storage_type === "cloned"
            ? p.text({
                message: "Default tag/branch",
                defaultValue: "auto",
                placeholder: "auto (detect default branch)",
              })
            : Promise.resolve(undefined),
        repo_path: ({ results }) =>
          results.storage_type === "local"
            ? p.text({
                message: "Repository path (absolute)",
                validate: (v) => (v.length === 0 ? "Required for local packages" : undefined),
              })
            : Promise.resolve(undefined),
        website_url: () =>
          p.text({ message: "Website URL (optional)", defaultValue: "" }),
        docs_url: () =>
          p.text({ message: "Documentation URL (optional)", defaultValue: "" }),
        git_browser_url: () =>
          p.text({ message: "Git browser URL (optional)", defaultValue: "" }),
        logo_url: () =>
          p.text({ message: "Logo URL (optional)", defaultValue: "" }),
      },
      {
        onCancel: () => {
          p.cancel("Cancelled.");
          process.exit(0);
        },
      },
    );

    const confirmed = await p.confirm({ message: "Create this package?" });
    if (p.isCancel(confirmed) || !confirmed) {
      p.cancel("Cancelled.");
      return;
    }

    const s = p.spinner();
    s.start("Creating package...");

    try {
      const result = await client.packages.create({
        identifier: values.identifier,
        package_manager: values.package_manager,
        display_name: (values.display_name || values.identifier) as string,
        storage_type: values.storage_type,
        repo_path: (values.repo_path as string | undefined) ?? undefined,
        default_tag: (values.default_tag as string | undefined) ?? undefined,
        urls: {
          website: (values.website_url as string) || undefined,
          docs: (values.docs_url as string) || undefined,
          git_browser: (values.git_browser_url as string) || undefined,
          git: (values.git_url as string | undefined) ?? undefined,
          logo: (values.logo_url as string) || undefined,
        },
      });
      s.stop("Package created!");
      p.log.success(`${pc.green(result.identifier)} added (clone status: ${result.cloneStatus})`);
    } catch (err) {
      s.stop("Failed to create package.", 1);
      p.log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }

    p.outro("Done");
  },
});
