import { defineCommand } from "citty";
import { packageAddCommand } from "./add.js";
import { packageEditCommand } from "./edit.js";
import { packagePullCommand } from "./pull.js";
import { packagePullAllCommand } from "./pull-all.js";

export const packageCommand = defineCommand({
  meta: { name: "package", description: "Manage packages" },
  subCommands: {
    add: packageAddCommand,
    edit: packageEditCommand,
    pull: packagePullCommand,
    "pull-all": packagePullAllCommand,
  },
});
