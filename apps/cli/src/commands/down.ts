import { defineCommand } from "citty";
import { composeExec } from "../utils/container.js";

export const downCommand = defineCommand({
  meta: { name: "down", description: "Stop and remove containers" },
  run() {
    console.log("Stopping and removing containers...");
    composeExec(["down"]);
  },
});
