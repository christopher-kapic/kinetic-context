import { defineCommand } from "citty";
import { composeExec } from "../utils/container.js";

export const stopCommand = defineCommand({
  meta: { name: "stop", description: "Stop kinetic-context services" },
  run() {
    console.log("Stopping kinetic-context...");
    composeExec(["stop"]);
  },
});
