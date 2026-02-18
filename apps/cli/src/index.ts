import { defineCommand, runMain } from "citty";
import { startCommand } from "./commands/start.js";
import { stopCommand } from "./commands/stop.js";
import { restartCommand } from "./commands/restart.js";
import { statusCommand } from "./commands/status.js";
import { logsCommand } from "./commands/logs.js";
import { downCommand } from "./commands/down.js";
import { updateCommand } from "./commands/update.js";
import { selfUpdateCommand } from "./commands/self-update.js";
import { initCommand } from "./commands/init.js";
import { packageCommand } from "./commands/package/index.js";
import { providerCommand } from "./commands/provider/index.js";

const main = defineCommand({
  meta: {
    name: "kctx",
    description: "Kinetic Context CLI",
  },
  subCommands: {
    start: startCommand,
    stop: stopCommand,
    restart: restartCommand,
    status: statusCommand,
    logs: logsCommand,
    down: downCommand,
    update: updateCommand,
    "self-update": selfUpdateCommand,
    init: initCommand,
    package: packageCommand,
    provider: providerCommand,
  },
});

runMain(main);
