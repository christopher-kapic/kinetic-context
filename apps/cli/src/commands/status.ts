import { defineCommand } from "citty";
import { composeExec } from "../utils/container.js";

export const statusCommand = defineCommand({
  meta: { name: "status", description: "Show container status" },
  run() {
    composeExec(["ps"]);
  },
});
