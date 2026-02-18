import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { client } from "../../client.js";

export const packageEditCommand = defineCommand({
  meta: { name: "edit", description: "Edit an existing package" },
  async run() {
    p.intro(pc.bgCyan(pc.black(" Edit Package ")));

    const s = p.spinner();
    s.start("Fetching packages...");
    let packages: Awaited<ReturnType<typeof client.packages.list>>;
    try {
      packages = await client.packages.list();
    } catch (err) {
      s.stop("Failed to fetch packages.", 1);
      p.log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
    s.stop("Packages loaded.");

    if (packages.length === 0) {
      p.log.warn("No packages found.");
      return;
    }

    const selected = await p.select({
      message: "Select a package to edit",
      options: packages.map((pkg) => ({
        value: pkg.identifier,
        label: `${pkg.identifier} (${pkg.display_name})`,
      })),
    });
    if (p.isCancel(selected)) {
      p.cancel("Cancelled.");
      return;
    }

    s.start("Fetching package details...");
    let pkg: Awaited<ReturnType<typeof client.packages.get>>;
    try {
      pkg = await client.packages.get({ identifier: selected });
    } catch (err) {
      s.stop("Failed to fetch package.", 1);
      p.log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
    s.stop("Package loaded.");

    const values = await p.group(
      {
        display_name: () =>
          p.text({
            message: "Display name",
            defaultValue: pkg.display_name,
            initialValue: pkg.display_name,
          }),
        package_manager: () =>
          p.text({
            message: "Package manager",
            defaultValue: pkg.package_manager,
            initialValue: pkg.package_manager,
          }),
        storage_type: () =>
          p.select({
            message: "Storage type",
            initialValue: pkg.storage_type,
            options: [
              { value: "cloned" as const, label: "Cloned" },
              { value: "local" as const, label: "Local" },
            ],
          }),
        git_url: ({ results }) =>
          results.storage_type === "cloned"
            ? p.text({
                message: "Git URL",
                defaultValue: pkg.urls?.git ?? "",
                initialValue: pkg.urls?.git ?? "",
              })
            : Promise.resolve(undefined),
        default_tag: ({ results }) =>
          results.storage_type === "cloned"
            ? p.text({
                message: "Default tag/branch",
                defaultValue: pkg.default_tag ?? "",
                initialValue: pkg.default_tag ?? "",
              })
            : Promise.resolve(undefined),
        repo_path: ({ results }) =>
          results.storage_type === "local"
            ? p.text({
                message: "Repository path",
                defaultValue: pkg.repo_path ?? "",
                initialValue: pkg.repo_path ?? "",
              })
            : Promise.resolve(undefined),
        website_url: () =>
          p.text({
            message: "Website URL",
            defaultValue: pkg.urls?.website ?? "",
            initialValue: pkg.urls?.website ?? "",
          }),
        docs_url: () =>
          p.text({
            message: "Documentation URL",
            defaultValue: pkg.urls?.docs ?? "",
            initialValue: pkg.urls?.docs ?? "",
          }),
        git_browser_url: () =>
          p.text({
            message: "Git browser URL",
            defaultValue: pkg.urls?.git_browser ?? "",
            initialValue: pkg.urls?.git_browser ?? "",
          }),
        logo_url: () =>
          p.text({
            message: "Logo URL",
            defaultValue: pkg.urls?.logo ?? "",
            initialValue: pkg.urls?.logo ?? "",
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

    s.start("Updating package...");
    try {
      await client.packages.update({
        identifier: selected,
        display_name: values.display_name,
        package_manager: values.package_manager,
        storage_type: values.storage_type,
        repo_path: (values.repo_path as string | undefined) ?? undefined,
        default_tag: (values.default_tag as string | undefined) ?? undefined,
        urls: {
          website: values.website_url || undefined,
          docs: values.docs_url || undefined,
          git_browser: values.git_browser_url || undefined,
          git: (values.git_url as string | undefined) ?? undefined,
          logo: values.logo_url || undefined,
        },
      });
      s.stop("Package updated!");
    } catch (err) {
      s.stop("Failed to update package.", 1);
      p.log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }

    p.outro("Done");
  },
});
