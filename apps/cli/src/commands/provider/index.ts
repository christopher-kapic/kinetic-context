import { defineCommand } from "citty";
import { providerAddCommand } from "./add.js";
import { providerEditCommand } from "./edit.js";

export const providerCommand = defineCommand({
  meta: { name: "provider", description: "Manage providers" },
  subCommands: {
    add: providerAddCommand,
    edit: providerEditCommand,
  },
});
