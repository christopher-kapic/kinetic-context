import { defineCommand } from "citty";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { client } from "../../client.js";

export const packagePullCommand = defineCommand({
  meta: { name: "pull", description: "Pull latest changes for a package" },
  args: {
    identifier: {
      type: "positional",
      description: "Package identifier (optional, will prompt if omitted)",
      required: false,
    },
  },
  async run({ args }) {
    p.intro(pc.bgCyan(pc.black(" Pull Package ")));

    let targetId = args.identifier;

    if (!targetId) {
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

      const cloned = packages.filter((pkg) => pkg.storage_type === "cloned");
      if (cloned.length === 0) {
        p.log.warn("No cloned packages found. Only cloned packages can be pulled.");
        return;
      }

      const selected = await p.select({
        message: "Select a package to pull",
        options: cloned.map((pkg) => ({
          value: pkg.identifier,
          label: `${pkg.identifier} (${pkg.display_name})`,
        })),
      });
      if (p.isCancel(selected)) {
        p.cancel("Cancelled.");
        return;
      }
      targetId = selected;
    }

    const s = p.spinner();
    s.start(`Fetching package details for ${targetId}...`);
    let pkg: Awaited<ReturnType<typeof client.packages.get>>;
    try {
      pkg = await client.packages.get({ identifier: targetId });
    } catch (err) {
      s.stop("Failed to fetch package.", 1);
      p.log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }

    if (pkg.storage_type !== "cloned") {
      s.stop(`Only cloned packages can be pulled. '${targetId}' is a local package.`, 1);
      process.exit(1);
    }

    if (!pkg.repo_path || !existsSync(pkg.repo_path)) {
      s.stop(`Repository path not found: ${pkg.repo_path ?? "N/A"}`, 1);
      process.exit(1);
    }

    s.message("Pulling from remote...");
    const result = spawnSync("git", ["-C", pkg.repo_path, "pull", "origin"], {
      stdio: "inherit",
    });

    if (result.status === 0) {
      s.stop(`Successfully pulled updates for ${pc.green(targetId)}`);
    } else {
      s.stop(`Failed to pull updates for ${targetId}`, 1);
      process.exit(1);
    }

    p.outro("Done");
  },
});
