import { defineCommand } from "citty";
import { writeFileSync, copyFileSync, unlinkSync, chmodSync } from "node:fs";
import { KCTX_SCRIPT, GITHUB_RAW_URL } from "../constants.js";

export const selfUpdateCommand = defineCommand({
  meta: { name: "self-update", description: "Update kctx script only" },
  async run() {
    console.log("Updating kctx script...");
    const backup = `${KCTX_SCRIPT}.bak`;
    try {
      copyFileSync(KCTX_SCRIPT, backup);
    } catch {
      // Script may not exist yet
    }

    try {
      const res = await fetch(`${GITHUB_RAW_URL}/kctx`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.text();
      writeFileSync(KCTX_SCRIPT, body);
      chmodSync(KCTX_SCRIPT, 0o755);
      try { unlinkSync(backup); } catch { /* ignore */ }
      console.log("kctx script updated successfully.");
    } catch {
      console.error("Failed to fetch latest kctx script, restoring backup...");
      try {
        copyFileSync(backup, KCTX_SCRIPT);
        unlinkSync(backup);
      } catch { /* ignore */ }
      process.exit(1);
    }
  },
});
