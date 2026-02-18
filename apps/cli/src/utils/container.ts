import { spawnSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { COMPOSE_FILE } from "../constants.js";

let _containerCmd: string | undefined;

export function getContainerCmd(): string {
  if (_containerCmd) return _containerCmd;

  for (const cmd of ["docker", "podman"]) {
    const result = spawnSync(cmd, ["--version"], { stdio: "ignore" });
    if (result.status === 0) {
      _containerCmd = cmd;
      return cmd;
    }
  }

  console.error("Error: Neither docker nor podman is installed.");
  console.error("Please install docker or podman to use kinetic-context.");
  process.exit(1);
}

export function ensureComposeFile(): void {
  if (!existsSync(COMPOSE_FILE)) {
    console.error(`Error: compose.yaml not found at ${COMPOSE_FILE}`);
    console.error("Please run the setup script again.");
    process.exit(1);
  }
}

export function composeExec(args: string[]): number {
  ensureComposeFile();
  const cmd = getContainerCmd();
  const result = spawnSync(cmd, ["compose", "-f", COMPOSE_FILE, ...args], {
    stdio: "inherit",
  });
  return result.status ?? 1;
}

export function composeSpawn(args: string[]): ChildProcess {
  ensureComposeFile();
  const cmd = getContainerCmd();
  return spawn(cmd, ["compose", "-f", COMPOSE_FILE, ...args], {
    stdio: "inherit",
  });
}
