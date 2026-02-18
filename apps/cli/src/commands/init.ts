import { defineCommand } from "citty";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { COMPOSE_FILE } from "../constants.js";

const DEFAULT_CONFIG = JSON.stringify(
  {
    $schema: "https://opencode.ai/config.json",
    provider: {},
    agent: {
      default: {
        mode: "primary",
        prompt:
          "You are an AI agent whose job is to answer questions about the codebase you are asked about. Your primary responsibility is to help developers understand how to use dependencies and codebases effectively. When answering questions:\n\n1. Provide clear, practical answers with code examples when relevant\n2. Reference specific files, functions, or patterns in the codebase when possible\n3. Explain not just what the code does, but how to use it effectively\n4. If the question is ambiguous, ask clarifying questions\n5. Focus on helping developers understand how to integrate and use the dependency in their projects",
        tools: { write: false, edit: false, bash: false },
      },
    },
  },
  null,
  2,
);

export const initCommand = defineCommand({
  meta: { name: "init", description: "Initialize configuration files" },
  run() {
    console.log("Initializing kinetic-context configuration...");

    if (!existsSync(COMPOSE_FILE)) {
      console.error(
        "Error: compose.yaml not found. Please run the setup script first.",
      );
      process.exit(1);
    }

    const configDir =
      process.env["OPENCODE_CONFIG_DIR"] ??
      join(homedir(), ".kctx", "opencode", "config");

    console.log(`Config directory: ${configDir}`);

    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
      console.log(`Created config directory: ${configDir}`);
    }

    const configFile = join(configDir, "opencode.json");
    if (existsSync(configFile)) {
      console.log(`opencode.json already exists at ${configFile}`);
      console.log("Skipping initialization (existing config preserved)");
      return;
    }

    writeFileSync(configFile, DEFAULT_CONFIG);
    console.log(`Created default opencode.json at ${configFile}`);
    console.log("\nConfiguration initialized successfully!");
    console.log("\nNext steps:");
    console.log("  1. kctx start - Start the kinetic-context services");
    console.log("  2. kctx provider add - Add a model provider");
  },
});
