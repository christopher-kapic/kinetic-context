import { defineCommand } from "citty";
import { composeSpawn } from "../utils/container.js";

const SERVICE_ALIASES: Record<string, string> = {
  kc: "kinetic-context",
  oc: "opencode",
};

export const logsCommand = defineCommand({
  meta: { name: "logs", description: "Show container logs" },
  args: {
    service: {
      type: "positional",
      description: "Service name (kc, oc, or full name)",
      required: false,
    },
  },
  run({ args }) {
    const service = args.service
      ? SERVICE_ALIASES[args.service] ?? args.service
      : undefined;

    const composeArgs = service ? ["logs", service] : ["logs"];
    const child = composeSpawn(composeArgs);

    child.on("exit", (code) => {
      process.exit(code ?? 0);
    });
  },
});
