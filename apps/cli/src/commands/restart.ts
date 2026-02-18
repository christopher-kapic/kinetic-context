import { defineCommand } from "citty";
import { composeExec } from "../utils/container.js";

export const restartCommand = defineCommand({
  meta: { name: "restart", description: "Restart kinetic-context services" },
  run() {
    console.log("Restarting kinetic-context...");
    composeExec(["restart"]);
  },
});
