import { defineCommand } from "citty";
import { composeExec } from "../utils/container.js";

export const startCommand = defineCommand({
  meta: { name: "start", description: "Start kinetic-context services" },
  run() {
    console.log("Starting kinetic-context...");
    composeExec(["up", "-d"]);
    console.log("kinetic-context is running!");
    console.log("  Web UI: http://localhost:7167");
    console.log("  OpenCode: http://localhost:7168");
  },
});
