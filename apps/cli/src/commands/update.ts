import { defineCommand } from "citty";
import { spawnSync } from "node:child_process";
import { writeFileSync, copyFileSync, unlinkSync, chmodSync } from "node:fs";
import { composeExec, getContainerCmd } from "../utils/container.js";
import { KCTX_SCRIPT, GITHUB_RAW_URL } from "../constants.js";

export const updateCommand = defineCommand({
  meta: {
    name: "update",
    description: "Update kctx and Docker images, then restart services",
  },
  async run() {
    console.log("Updating kinetic-context...");

    // Update kctx script
    console.log("Updating kctx script...");
    const backup = `${KCTX_SCRIPT}.bak`;
    try {
      copyFileSync(KCTX_SCRIPT, backup);
    } catch {
      // Script may not exist yet; that's fine
    }

    try {
      const res = await fetch(`${GITHUB_RAW_URL}/kctx`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.text();
      writeFileSync(KCTX_SCRIPT, body);
      chmodSync(KCTX_SCRIPT, 0o755);
      try { unlinkSync(backup); } catch { /* ignore */ }
      console.log("kctx script updated successfully.");
    } catch (err) {
      console.error("Failed to fetch latest kctx script, restoring backup...");
      try {
        copyFileSync(backup, KCTX_SCRIPT);
        unlinkSync(backup);
      } catch { /* ignore */ }
      console.error("kctx update failed. Docker images will not be updated.");
      process.exit(1);
    }

    // Pull latest images
    console.log("\nPulling latest Docker images...");
    const cmd = getContainerCmd();
    spawnSync(cmd, ["pull", "docker.io/christopherkapic/kinetic-context:latest"], {
      stdio: "inherit",
    });

    const inspectResult = spawnSync(cmd, ["image", "inspect", "opencode:local"], {
      stdio: "ignore",
    });
    if (inspectResult.status === 0) {
      console.log("Using local OpenCode image (rebuild skipped)");
    } else {
      spawnSync(cmd, ["pull", "ghcr.io/anomalyco/opencode:latest"], {
        stdio: "inherit",
      });
    }

    console.log("\nRestarting services with new images...");
    composeExec(["up", "-d", "--force-recreate"]);
    console.log("Update complete!");
  },
});
