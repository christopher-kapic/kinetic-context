import { homedir } from "node:os";
import { join } from "node:path";

export const KCTX_HOME = join(homedir(), ".kctx");
export const COMPOSE_FILE = join(KCTX_HOME, "compose.yaml");
export const KCTX_SCRIPT = join(KCTX_HOME, "bin", "kctx");
export const API_BASE = "http://localhost:7167/rpc";
export const GITHUB_RAW_URL =
  "https://raw.githubusercontent.com/christopher-kapic/kinetic-context/master";
