import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { client } from "../../client.js";

export const packagePullAllCommand = defineCommand({
  meta: { name: "pull-all", description: "Pull latest changes for all packages" },
  async run() {
    p.intro(pc.bgCyan(pc.black(" Pull All Packages ")));

    const s = p.spinner();
    s.start("Updating all packages...");

    try {
      const results = await client.packages.updateAll();
      s.stop("All packages updated.");

      for (const r of results) {
        if (r.success) {
          p.log.success(`${pc.green(r.identifier)} (${r.display_name})`);
        } else {
          p.log.error(`${pc.red(r.identifier)} (${r.display_name}): ${r.error ?? "unknown error"}`);
        }
      }

      const succeeded = results.filter((r) => r.success).length;
      const failed = results.length - succeeded;
      p.outro(`${succeeded} succeeded, ${failed} failed`);
    } catch (err) {
      s.stop("Failed to update packages.", 1);
      p.log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  },
});
