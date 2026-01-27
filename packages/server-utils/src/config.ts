import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { join, dirname } from "node:path";
import { z } from "zod";
import { getRepoIdentifierFromUrl } from "./git";
import { logger } from "./logger";

// Legacy package config schema (before storage_type and repo_path were added)
const LegacyPackageConfigSchema = z.object({
  identifier: z.string(),
  package_manager: z.string(),
  display_name: z.string(),
  default_tag: z.string(),
  urls: z.object({
    website: z.string().optional(),
    docs: z.string().optional(),
    git_browser: z.string().optional(),
    git: z.string(), // Required in legacy format
    logo: z.string().optional(),
  }),
});

const PackageConfigSchema = z.object({
  identifier: z.string(),
  package_manager: z.string(),
  display_name: z.string(),
  storage_type: z.enum(["cloned", "local"]),
  repo_path: z.string(), // Absolute path to git repo
  default_tag: z.string().optional(), // Only used for cloned repos
  urls: z.object({
    website: z.string().optional(),
    docs: z.string().optional(),
    git_browser: z.string().optional(),
    git: z.string().optional(), // Only required for cloned repos
    logo: z.string().optional(),
  }),
});

const ProjectDependencySchema = z.object({
  identifier: z.string(),
  tag: z.string().optional(),
});

const ProjectConfigSchema = z.object({
  identifier: z.string(),
  display_name: z.string(),
  urls: z.object({
    website: z.string().optional(),
    git_browser: z.string().optional(),
    git: z.string().optional(),
    logo: z.string().optional(),
  }),
  dependencies: z.array(ProjectDependencySchema),
});

export type PackageConfig = z.infer<typeof PackageConfigSchema>;
export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
export type ProjectDependency = z.infer<typeof ProjectDependencySchema>;

export async function readPackageConfig(
  packagesDir: string,
  identifier: string,
  silent: boolean = false,
): Promise<PackageConfig | null> {
  try {
    // Handle nested paths (e.g., @tanstack/ai -> @tanstack/ai.json)
    const configPath = join(packagesDir, `${identifier}.json`);
    const content = await readFile(configPath, "utf-8");
    const parsed = JSON.parse(content);

    // Try new schema first
    const newSchemaResult = PackageConfigSchema.safeParse(parsed);
    if (newSchemaResult.success) {
      return newSchemaResult.data;
    }

    // Try legacy schema and migrate if found
    const legacyResult = LegacyPackageConfigSchema.safeParse(parsed);
    if (legacyResult.success) {
      logger.log("[config]", `Migrating legacy package config: ${identifier}`);
      const legacy = legacyResult.data;

      // Get default packages directory for migration
      const dataDir = dirname(packagesDir) || "/data";
      const globalConfig = await readGlobalConfig(dataDir);
      const defaultPackagesDir = globalConfig.default_packages_dir;

      // Use normalized git URL to determine repo path (allows sharing between packages)
      const repoIdentifier = getRepoIdentifierFromUrl(legacy.urls.git);
      const repoPath = join(defaultPackagesDir, repoIdentifier);

      // Migrate to new format
      const migrated: PackageConfig = {
        identifier: legacy.identifier,
        package_manager: legacy.package_manager,
        display_name: legacy.display_name,
        storage_type: "cloned", // Legacy packages were always cloned
        repo_path: repoPath, // Use normalized path for repo sharing
        default_tag: legacy.default_tag,
        urls: legacy.urls,
      };

      // Write migrated config back to disk
      await writePackageConfig(packagesDir, migrated);
      logger.log("[config]", `Successfully migrated package config: ${identifier}`);

      return migrated;
    }

    // Neither schema matched - only log if not silent
    if (!silent) {
      logger.error("[config]", `Failed to parse package config ${identifier}: Invalid schema`);
    }
    return null;
  } catch (error) {
    // Only log if not silent
    if (!silent) {
      logger.error("[config]", `Error reading package config ${identifier}:`, error);
    }
    return null;
  }
}

export async function readProjectConfig(
  projectsDir: string,
  identifier: string,
): Promise<ProjectConfig | null> {
  try {
    const configPath = join(projectsDir, `${identifier}.json`);
    const content = await readFile(configPath, "utf-8");
    const parsed = JSON.parse(content);
    return ProjectConfigSchema.parse(parsed);
  } catch (error) {
    return null;
  }
}

export async function listPackageConfigs(
  packagesDir: string,
): Promise<PackageConfig[]> {
  try {
    const { readdir, stat, access } = await import("node:fs/promises");
    const { constants } = await import("node:fs");
    const configs: PackageConfig[] = [];

    async function isGitRepository(dir: string): Promise<boolean> {
      try {
        const gitPath = join(dir, ".git");
        await access(gitPath, constants.F_OK);
        return true;
      } catch {
        return false;
      }
    }

    async function scanDirectory(dir: string, prefix: string = ""): Promise<void> {
      const entries = await readdir(dir);

      for (const entry of entries) {
        const fullPath = join(dir, entry);
        const stats = await stat(fullPath);

        if (stats.isDirectory()) {
          // Skip git repositories (cloned repos)
          if (await isGitRepository(fullPath)) {
            continue;
          }
          // Recursively scan subdirectories (for scoped packages like @hookform/)
          await scanDirectory(fullPath, prefix ? `${prefix}/${entry}` : entry);
        } else if (entry.endsWith(".json")) {
          const identifier = prefix
            ? `${prefix}/${entry.replace(/\.json$/, "")}`
            : entry.replace(/\.json$/, "");
          // Use silent=true to suppress error logs when scanning
          const config = await readPackageConfig(packagesDir, identifier, true);
          if (config) {
            configs.push(config);
          }
        }
      }
    }

    await scanDirectory(packagesDir);
    return configs;
  } catch (error) {
    return [];
  }
}

export async function listProjectConfigs(
  projectsDir: string,
): Promise<ProjectConfig[]> {
  try {
    const { readdir } = await import("node:fs/promises");
    const files = await readdir(projectsDir);
    const configs: ProjectConfig[] = [];

    for (const file of files) {
      if (file.endsWith(".json")) {
        const identifier = file.replace(/\.json$/, "");
        const config = await readProjectConfig(projectsDir, identifier);
        if (config) {
          configs.push(config);
        }
      }
    }

    return configs;
  } catch (error) {
    return [];
  }
}

export async function writePackageConfig(
  packagesDir: string,
  config: PackageConfig,
): Promise<void> {
  await mkdir(packagesDir, { recursive: true });
  const configPath = join(packagesDir, `${config.identifier}.json`);

  // If identifier contains '/', we need to create nested directories
  // e.g., @tanstack/ai.json needs @tanstack/ directory
  const pathParts = config.identifier.split("/");
  if (pathParts.length > 1) {
    // Everything except the last part is the directory
    const dirParts = pathParts.slice(0, -1);
    const nestedDir = join(packagesDir, ...dirParts);
    await mkdir(nestedDir, { recursive: true });
  }

  await writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
}

export async function writeProjectConfig(
  projectsDir: string,
  config: ProjectConfig,
): Promise<void> {
  await mkdir(projectsDir, { recursive: true });
  const configPath = join(projectsDir, `${config.identifier}.json`);
  await writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
}

export async function deletePackageConfig(
  packagesDir: string,
  identifier: string,
): Promise<void> {
  const configPath = join(packagesDir, `${identifier}.json`);
  try {
    await unlink(configPath);
  } catch (error) {
    // File might not exist, ignore
  }
}

export async function deleteProjectConfig(
  projectsDir: string,
  identifier: string,
): Promise<void> {
  const configPath = join(projectsDir, `${identifier}.json`);
  try {
    await unlink(configPath);
  } catch (error) {
    // File might not exist, ignore
  }
}

// OpenCode config schema (flexible to allow any valid opencode.json structure)
// Using a more permissive schema to avoid Zod v4 issues with passthrough and nested records
const OpencodeConfigSchema = z.any();

export type OpencodeConfig = {
  $schema?: string;
  model?: string;
  provider?: Record<
    string,
    {
      npm?: string;
      name?: string;
      options?: Record<string, unknown>;
      models?: Record<string, unknown>;
      [key: string]: unknown;
    }
  >;
  agent?: Record<
    string,
    {
      mode?: "primary" | "subagent" | "all";
      model?: string;
      prompt?: string;
      description?: string;
      tools?: {
        write?: boolean;
        edit?: boolean;
        bash?: boolean;
      };
      [key: string]: unknown;
    }
  > | string; // Support both object format and legacy string format
  [key: string]: unknown;
};

export async function readOpencodeConfig(
  configPath: string,
): Promise<OpencodeConfig> {
  try {
    const { existsSync } = await import("node:fs");
    if (!existsSync(configPath)) {
      // Return default config with default agent
      return {
        $schema: "https://opencode.ai/config.json",
        provider: {},
        agent: {
          default: {
            mode: "primary",
            prompt:
              "You are an AI agent whose job is to answer questions about the codebase you are asked about. Your primary responsibility is to help developers understand how to use dependencies and codebases effectively. When answering questions:\n\n1. Provide clear, practical answers with code examples when relevant\n2. Reference specific files, functions, or patterns in the codebase when possible\n3. Explain not just what the code does, but how to use it effectively\n4. If the question is ambiguous, ask clarifying questions\n5. Focus on helping developers understand how to integrate and use the dependency in their projects",
            tools: {
              write: false,
              edit: false,
              bash: false,
            },
          },
        },
      };
    }
    const content = await readFile(configPath, "utf-8");
    const parsed = JSON.parse(content);
    // Basic validation - ensure it's an object
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {
        $schema: "https://opencode.ai/config.json",
        provider: {},
        agent: {
          default: {
            mode: "primary",
            prompt:
              "You are an AI agent whose job is to answer questions about the codebase you are asked about. Your primary responsibility is to help developers understand how to use dependencies and codebases effectively. When answering questions:\n\n1. Provide clear, practical answers with code examples when relevant\n2. Reference specific files, functions, or patterns in the codebase when possible\n3. Explain not just what the code does, but how to use it effectively\n4. If the question is ambiguous, ask clarifying questions\n5. Focus on helping developers understand how to integrate and use the dependency in their projects",
            tools: {
              write: false,
              edit: false,
              bash: false,
            },
          },
        },
      };
    }

    // Clean up provider structure if it exists
    if (parsed.provider) {
      const cleanedProvider: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(parsed.provider)) {
        // Only include valid provider objects
        if (
          typeof value === "object" &&
          value !== null &&
          !Array.isArray(value)
        ) {
          cleanedProvider[key] = value;
        }
        // Skip invalid entries (strings, arrays, null, etc.)
      }
      parsed.provider = cleanedProvider;
    }

    // Ensure default agent exists if agent config is missing or doesn't have default
    if (
      !parsed.agent ||
      typeof parsed.agent !== "object" ||
      !parsed.agent.default
    ) {
      if (!parsed.agent) {
        parsed.agent = {};
      }
      parsed.agent.default = {
        mode: "primary",
        prompt:
          "You are an AI agent whose job is to answer questions about the codebase you are asked about. Your primary responsibility is to help developers understand how to use dependencies and codebases effectively. When answering questions:\n\n1. Provide clear, practical answers with code examples when relevant\n2. Reference specific files, functions, or patterns in the codebase when possible\n3. Explain not just what the code does, but how to use it effectively\n4. If the question is ambiguous, ask clarifying questions\n5. Focus on helping developers understand how to integrate and use the dependency in their projects",
        tools: {
          write: false,
          edit: false,
          bash: false,
        },
      };
    }

    return parsed as OpencodeConfig;
  } catch (error) {
    // If parsing fails, return default
    if (error instanceof SyntaxError || error instanceof TypeError) {
      return {
        $schema: "https://opencode.ai/config.json",
        provider: {},
        agent: {
          default: {
            mode: "primary",
            prompt:
              "You are an AI agent whose job is to answer questions about the codebase you are asked about. Your primary responsibility is to help developers understand how to use dependencies and codebases effectively. When answering questions:\n\n1. Provide clear, practical answers with code examples when relevant\n2. Reference specific files, functions, or patterns in the codebase when possible\n3. Explain not just what the code does, but how to use it effectively\n4. If the question is ambiguous, ask clarifying questions\n5. Focus on helping developers understand how to integrate and use the dependency in their projects",
            tools: {
              write: false,
              edit: false,
              bash: false,
            },
          },
        },
      };
    }
    throw error;
  }
}

export async function writeOpencodeConfig(
  configPath: string,
  config: OpencodeConfig,
): Promise<void> {
  // Ensure directory exists
  const { dirname } = await import("node:path");
  const configDir = dirname(configPath);
  await mkdir(configDir, { recursive: true });

  // Basic validation - ensure it's an object
  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    throw new Error("Config must be an object");
  }

  // Clean up and validate provider structure
  const validated = { ...config };
  if (validated.provider) {
    logger.log("[config]", `Processing providers:`, Object.keys(validated.provider));
    const cleanedProvider: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(validated.provider)) {
      // Only include valid provider objects
      if (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
      ) {
        cleanedProvider[key] = value;
        logger.log("[config]", `Keeping valid provider '${key}'`);
      } else {
        // Log skipped invalid entries for debugging
        logger.log(
          "[config]",
          `Skipping invalid provider entry '${key}': expected object, got ${typeof value}`,
          value,
        );
      }
    }
    validated.provider = cleanedProvider;
    logger.log("[config]", `Final providers after cleanup:`, Object.keys(validated.provider));
  } else {
    // If provider is missing, initialize it as empty object
    validated.provider = {};
    logger.log("[config]", `No provider field in config, initializing as empty object`);
  }

  // Ensure $schema is set
  if (!validated.$schema) {
    validated.$schema = "https://opencode.ai/config.json";
  }

  // Ensure default agent exists if agent config is missing or doesn't have default
  if (
    !validated.agent ||
    typeof validated.agent !== "object" ||
    !validated.agent.default
  ) {
    if (!validated.agent) {
      validated.agent = {};
    }
    validated.agent.default = {
      mode: "primary",
      prompt:
        "You are an AI agent whose job is to answer questions about the codebase you are asked about. Your primary responsibility is to help developers understand how to use dependencies and codebases effectively. When answering questions:\n\n1. Provide clear, practical answers with code examples when relevant\n2. Reference specific files, functions, or patterns in the codebase when possible\n3. Explain not just what the code does, but how to use it effectively\n4. If the question is ambiguous, ask clarifying questions\n5. Focus on helping developers understand how to integrate and use the dependency in their projects",
      tools: {
        write: false,
        edit: false,
        bash: false,
      },
    };
  }

  await writeFile(configPath, JSON.stringify(validated, null, 2), "utf-8");
}

// Global config schema for kinetic-context settings
const GlobalConfigSchema = z.object({
  default_packages_dir: z.string().default("/data/packages"),
  default_agent_prompt: z.string().optional(),
});

export type GlobalConfig = z.infer<typeof GlobalConfigSchema>;

export async function readGlobalConfig(
  dataDir: string,
): Promise<GlobalConfig> {
  try {
    const configPath = join(dataDir, "config.json");
    const { existsSync } = await import("node:fs");
    if (!existsSync(configPath)) {
      // Return default config
      return {
        default_packages_dir: "/data/packages",
        default_agent_prompt: `You are an AI agent whose job is to answer questions about the codebase you are asked about. Your primary responsibility is to help developers understand how to use dependencies and codebases effectively. When answering questions:

1. Provide clear, practical answers with code examples when relevant
2. Reference specific files, functions, or patterns in the codebase when possible
3. Explain not just what the code does, but how to use it effectively
4. If the question is ambiguous, ask clarifying questions
5. Focus on helping developers understand how to integrate and use the dependency in their projects`,
      };
    }
    const content = await readFile(configPath, "utf-8");
    const parsed = JSON.parse(content);
    return GlobalConfigSchema.parse(parsed);
  } catch (error) {
    // If parsing fails, return default
    return {
      default_packages_dir: "/data/packages",
      default_agent_prompt: `You are an AI agent whose job is to answer questions about the codebase you are asked about. Your primary responsibility is to help developers understand how to use dependencies and codebases effectively. When answering questions:

1. Provide clear, practical answers with code examples when relevant
2. Reference specific files, functions, or patterns in the codebase when possible
3. Explain not just what the code does, but how to use it effectively
4. If the question is ambiguous, ask clarifying questions
5. Focus on helping developers understand how to integrate and use the dependency in their projects`,
    };
  }
}

export async function writeGlobalConfig(
  dataDir: string,
  config: GlobalConfig,
): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  const configPath = join(dataDir, "config.json");
  const validated = GlobalConfigSchema.parse(config);
  await writeFile(configPath, JSON.stringify(validated, null, 2), "utf-8");
}
