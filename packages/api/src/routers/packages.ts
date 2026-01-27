import { z } from "zod";
import { ORPCError, eventIterator } from "@orpc/server";
import { publicProcedure } from "../index";
import { env } from "@kinetic-context/env/server";
import {
  listPackageConfigs,
  readPackageConfig,
  writePackageConfig,
  deletePackageConfig,
  readOpencodeConfig,
  ensureRepoCloned,
  ensureRepoAvailable,
  checkoutTag,
  getRepoIdentifierFromUrl,
  getDefaultBranch,
  discoverGitRepositories,
  pullRepository,
  queryOpencodeStream,
  type PackageConfig,
  type OpencodeModel,
} from "@kinetic-context/server-utils";
import { join } from "node:path";

// In-memory clone status tracking
const cloneStatus = new Map<
  string,
  "pending" | "cloning" | "completed" | "error"
>();

const CreatePackageInputSchema = z.object({
  identifier: z.string().min(1),
  package_manager: z.string(), // Can be empty
  display_name: z.string().min(1),
  storage_type: z.enum(["cloned", "local"]),
  repo_path: z.string().optional(), // Required for local repos, calculated for cloned
  default_tag: z.string().optional(), // Only for cloned repos, can be "auto" or a specific branch/tag
  urls: z.object({
    website: z.string().optional(),
    docs: z.string().optional(),
    git_browser: z.string().optional(),
    git: z.string().optional(), // Required for cloned repos
    logo: z.string().optional(),
  }),
}).superRefine((data, ctx) => {
  // If cloned, git URL is required
  if (data.storage_type === "cloned" && !data.urls.git) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Git URL is required for cloned repositories",
      path: ["urls", "git"],
    });
  }
  // If local, repo_path is required
  if (data.storage_type === "local" && !data.repo_path) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Repository path is required for local repositories",
      path: ["repo_path"],
    });
  }
});

const UpdatePackageInputSchema = z.object({
  identifier: z.string().min(1),
  package_manager: z.string().optional(),
  display_name: z.string().min(1).optional(),
  storage_type: z.enum(["cloned", "local"]).optional(),
  repo_path: z.string().optional(),
  default_tag: z.string().optional(),
  urls: z
    .object({
      website: z.string().optional(),
      docs: z.string().optional(),
      git_browser: z.string().optional(),
      git: z.string().optional(),
      logo: z.string().optional(),
    })
    .optional(),
});

// Helper function to get the correct packages directory based on storage type
function getPackagesDir(storageType: "cloned" | "local"): string {
  if (storageType === "cloned") {
    return env.PACKAGES_DIR;
  } else {
    // local uses LOCAL_PACKAGES_DIR
    return env.LOCAL_PACKAGES_DIR;
  }
}

// Helper function to find a package in either directory
async function findPackageConfig(identifier: string): Promise<{ config: PackageConfig; dir: string } | null> {
  // Try packages directory first (cloned repos)
  let config = await readPackageConfig(env.PACKAGES_DIR, identifier, true);
  if (config) {
    return { config, dir: env.PACKAGES_DIR };
  }
  
  // Try local packages directory (local repos)
  config = await readPackageConfig(env.LOCAL_PACKAGES_DIR, identifier, true);
  if (config) {
    return { config, dir: env.LOCAL_PACKAGES_DIR };
  }
  
  return null;
}

// Async clone function for cloned repos
async function cloneRepository(
  identifier: string,
  repoPath: string,
  gitUrl: string,
  defaultTag?: string
): Promise<void> {
  cloneStatus.set(identifier, "cloning");
  try {
    // ensureRepoCloned now uses the git URL to determine the repo location
    // This allows multiple packages from the same repo to share the same clone
    const actualRepoPath = await ensureRepoCloned(env.PACKAGES_DIR, gitUrl);
    
    // If defaultTag is "auto", detect the default branch
    if (defaultTag === "auto") {
      const detectedBranch = await getDefaultBranch(actualRepoPath);

      // Update the package config with the detected branch
      const pkg = await readPackageConfig(env.PACKAGES_DIR, identifier);
      if (pkg) {
        pkg.default_tag = detectedBranch;
        // Also update repo_path to match the actual shared location
        pkg.repo_path = actualRepoPath;
        await writePackageConfig(env.PACKAGES_DIR, pkg);
      }

      // Checkout the detected branch
      await checkoutTag(actualRepoPath, detectedBranch);
    } else if (defaultTag) {
      // Checkout the specified tag/branch
      await checkoutTag(actualRepoPath, defaultTag);
    }

    // Update the package config with the actual repo path (in case it was different)
    const pkg = await readPackageConfig(env.PACKAGES_DIR, identifier);
    if (pkg && pkg.repo_path !== actualRepoPath) {
      pkg.repo_path = actualRepoPath;
      await writePackageConfig(env.PACKAGES_DIR, pkg);
    }
    
    cloneStatus.set(identifier, "completed");
  } catch (error) {
    cloneStatus.set(identifier, "error");
    console.error(`Failed to clone repository for ${identifier}:`, error);
  }
}

export const packagesRouter = {
  list: publicProcedure.handler(async () => {
    // List packages from both directories
    const clonedPackages = await listPackageConfigs(env.PACKAGES_DIR);
    const localPackages = await listPackageConfigs(env.LOCAL_PACKAGES_DIR);
    const allPackages = [...clonedPackages, ...localPackages];
    
    return allPackages.map((pkg) => ({
      ...pkg,
      cloneStatus: cloneStatus.get(pkg.identifier) ?? "completed",
    }));
  }),

  get: publicProcedure
    .input(z.object({ identifier: z.string() }))
    .handler(async ({ input }) => {
      const found = await findPackageConfig(input.identifier);
      if (!found) {
        throw new ORPCError({
          code: "NOT_FOUND",
          message: `Package with identifier "${input.identifier}" not found`,
        });
      }
      return {
        ...found.config,
        cloneStatus: cloneStatus.get(found.config.identifier) ?? "completed",
      };
    }),

  create: publicProcedure
    .input(CreatePackageInputSchema)
    .handler(async ({ input }) => {
      // Check if package already exists in either directory
      const existing = await findPackageConfig(input.identifier);
      if (existing) {
        throw new ORPCError({
          code: "CONFLICT",
          message: `Package with identifier "${input.identifier}" already exists`,
        });
      }

      // Determine repo_path and packages directory based on storage_type
      let repoPath: string;
      let packagesDir: string;
      
      if (input.storage_type === "cloned") {
        // For cloned repos, use a normalized identifier based on the git URL
        // This allows multiple packages from the same repo to share the same clone
        if (!input.urls.git) {
          throw new ORPCError({
            code: "BAD_REQUEST",
            message: "Git URL is required for cloned repositories",
          });
        }
        const repoIdentifier = getRepoIdentifierFromUrl(input.urls.git);
        // Use env.PACKAGES_DIR directly to match where ensureRepoCloned actually clones
        repoPath = join(env.PACKAGES_DIR, repoIdentifier);
        packagesDir = env.PACKAGES_DIR;
      } else {
        // For local repos, use the provided path
        if (!input.repo_path) {
          throw new ORPCError({
            code: "BAD_REQUEST",
            message: "Repository path is required for local repositories",
          });
        }
        repoPath = input.repo_path;
        packagesDir = env.LOCAL_PACKAGES_DIR;
      }

      const storageType = input.storage_type;

      const pkg: PackageConfig = {
        identifier: input.identifier,
        package_manager: input.package_manager,
        display_name: input.display_name,
        storage_type: storageType,
        repo_path: repoPath,
        default_tag: input.default_tag,
        urls: input.urls,
      };

      // Write config file to the correct directory
      await writePackageConfig(packagesDir, pkg);

      // Start async clone only for cloned repos (don't await)
      if (input.storage_type === "cloned" && input.urls.git) {
        cloneStatus.set(input.identifier, "pending");
        cloneRepository(input.identifier, repoPath, input.urls.git, input.default_tag).catch(
          (error) => {
            console.error(`Background clone failed for ${input.identifier}:`, error);
          }
        );
      } else {
        // For local repos, mark as completed immediately
        cloneStatus.set(input.identifier, "completed");
      }

      return {
        ...pkg,
        cloneStatus: input.storage_type === "cloned" ? ("pending" as const) : ("completed" as const),
      };
    }),

  update: publicProcedure
    .input(UpdatePackageInputSchema)
    .handler(async ({ input }) => {
      const found = await findPackageConfig(input.identifier);
      if (!found) {
        throw new ORPCError({
          code: "NOT_FOUND",
          message: `Package with identifier "${input.identifier}" not found`,
        });
      }

      const existing = found.config;
      const currentDir = found.dir;

      // Determine new storage type
      const newStorageType = input.storage_type ?? existing.storage_type;

      // Determine if we need to move the package to a different directory
      const newDir = getPackagesDir(newStorageType);
      const needsMove = currentDir !== newDir;

      const updated: PackageConfig = {
        ...existing,
        package_manager: input.package_manager ?? existing.package_manager,
        display_name: input.display_name ?? existing.display_name,
        storage_type: newStorageType,
        repo_path: input.repo_path ?? existing.repo_path,
        default_tag: input.default_tag ?? existing.default_tag,
        urls: input.urls ? { ...existing.urls, ...input.urls } : existing.urls,
      };

      // If storage type changed, delete from old location and write to new location
      if (needsMove) {
        await deletePackageConfig(currentDir, input.identifier);
      }

      await writePackageConfig(newDir, updated);
      return {
        ...updated,
        cloneStatus: cloneStatus.get(updated.identifier) ?? "completed",
      };
    }),

  delete: publicProcedure
    .input(z.object({ identifier: z.string() }))
    .handler(async ({ input }) => {
      const found = await findPackageConfig(input.identifier);
      if (!found) {
        throw new ORPCError({
          code: "NOT_FOUND",
          message: `Package with identifier "${input.identifier}" not found`,
        });
      }

      await deletePackageConfig(found.dir, input.identifier);
      cloneStatus.delete(input.identifier);
      return { success: true };
    }),

  getCloneStatus: publicProcedure
    .input(z.object({ identifier: z.string() }))
    .handler(async ({ input }) => {
      const status = cloneStatus.get(input.identifier) ?? "completed";
      return { status };
    }),

  getAvailableModels: publicProcedure.handler(async () => {
    const configPath = env.OPENCODE_CONFIG_PATH;
    const config = await readOpencodeConfig(configPath);
    
    const models: Array<{ providerId: string; modelId: string; displayName: string }> = [];
    let defaultModel: string | undefined;
    
    if (config?.provider && typeof config.provider === "object") {
      for (const [providerId, providerConfig] of Object.entries(config.provider)) {
        if (
          providerConfig &&
          typeof providerConfig === "object" &&
          "models" in providerConfig &&
          providerConfig.models &&
          typeof providerConfig.models === "object"
        ) {
          for (const [modelId, modelConfig] of Object.entries(providerConfig.models)) {
            if (modelConfig && typeof modelConfig === "object") {
              const displayName = (modelConfig as any).name || `${providerId}/${modelId}`;
              models.push({
                providerId,
                modelId,
                displayName,
              });
            }
          }
        }
      }
    }
    
    // Get default model from config.model field (format: "providerId/modelId")
    if (config?.model && typeof config.model === "string") {
      defaultModel = config.model;
    }
    
    return {
      models,
      defaultModel,
    };
  }),

  getAgentInfo: publicProcedure.handler(async () => {
    const configPath = env.OPENCODE_CONFIG_PATH;
    const config = await readOpencodeConfig(configPath);
    
    // Get default agent info from config
    let agentInfo: {
      name?: string;
      description?: string;
      prompt?: string;
    } | null = null;
    
    if (config?.agent) {
      if (typeof config.agent === "object" && config.agent.default) {
        const defaultAgent = config.agent.default;
        agentInfo = {
          name: defaultAgent.description || "Default Agent",
          description: defaultAgent.description,
          prompt: defaultAgent.prompt,
        };
      } else if (typeof config.agent === "string") {
        // Legacy format
        agentInfo = {
          name: "Default Agent",
          description: undefined,
          prompt: config.agent,
        };
      }
    }
    
    return agentInfo || {
      name: "Default Agent",
      description: undefined,
      prompt: undefined,
    };
  }),

  scanProjects: publicProcedure.handler(async () => {
    // Recursively scan projects directory for git repositories
    const discoveredRepos = await discoverGitRepositories(env.PROJECTS_DIR);
    
    // For each discovered repo, create a suggested package config
    const suggestions = await Promise.all(
      discoveredRepos.map(async (repo) => {
        // Extract a suggested identifier from the path
        const pathParts = repo.relativePath.split("/").filter(p => p.length > 0);
        const suggestedIdentifier = pathParts.length > 0 
          ? pathParts[pathParts.length - 1] 
          : `repo-${Date.now()}`;
        
        // Check if a package with this identifier already exists
        const existing = await findPackageConfig(suggestedIdentifier);
        
        return {
          path: repo.path,
          relativePath: repo.relativePath,
          suggestedIdentifier,
          alreadyExists: !!existing,
        };
      })
    );
    
    return suggestions;
  }),

  updateAll: publicProcedure.handler(async () => {
    const results: Array<{
      identifier: string;
      display_name: string;
      success: boolean;
      error?: string;
    }> = [];

    const clonedPackages = await listPackageConfigs(env.PACKAGES_DIR);

    // Track pulled repos to avoid pulling the same repo multiple times
    const pulledRepos = new Set<string>();

    for (const pkg of clonedPackages) {
      if (!pkg.urls?.git || !pkg.repo_path) continue;

      const repoIdentifier = getRepoIdentifierFromUrl(pkg.urls.git);

      // Skip if we already pulled this repo
      if (pulledRepos.has(repoIdentifier)) {
        results.push({
          identifier: pkg.identifier,
          display_name: pkg.display_name,
          success: true,
        });
        continue;
      }

      const pullResult = await pullRepository(pkg.repo_path);
      results.push({
        identifier: pkg.identifier,
        display_name: pkg.display_name,
        success: pullResult.success,
        error: pullResult.error,
      });

      pulledRepos.add(repoIdentifier);
    }

    return results;
  }),

  chat: publicProcedure
    .input(
      z.object({
        identifier: z.string(),
        message: z.string().min(1),
        model: z.string().optional(), // Format: "providerId/modelId"
        conversationId: z.string().optional(), // Session ID for multi-turn
      }),
    )
    .output(
      eventIterator(
        z.object({
          text: z.string(),
          done: z.boolean(),
          sessionId: z.string().optional(),
          thinking: z.string().optional(),
        }),
      ),
    )
    .handler(async function* ({ input }) {
      // Get package config from either directory
      const found = await findPackageConfig(input.identifier);
      if (!found) {
        throw new ORPCError({
          code: "NOT_FOUND",
          message: `Package with identifier "${input.identifier}" not found`,
        });
      }

      const pkg = found.config;

      // Ensure repo is available (cloned or local)
      const packagesDir = getPackagesDir(pkg.storage_type);
      const repoPath = await ensureRepoAvailable(
        pkg.repo_path,
        pkg.storage_type,
        pkg.urls.git,
        packagesDir,
      );

      // Only checkout tag for cloned repos
      if (pkg.storage_type === "cloned" && pkg.default_tag) {
        await checkoutTag(repoPath, pkg.default_tag);
      }

      // Parse model if provided
      let model: OpencodeModel | undefined;
      if (input.model) {
        const parts = input.model.split("/");
        if (parts.length >= 2) {
          model = {
            providerID: parts[0],
            modelID: parts.slice(1).join("/"), // Handle models with slashes in ID
          };
        } else {
          throw new ORPCError({
            code: "BAD_REQUEST",
            message: `Invalid model format. Expected "providerId/modelId", got "${input.model}"`,
          });
        }
      }

      // Stream the response
      try {
        for await (const chunk of queryOpencodeStream(
          repoPath,
          input.message,
          model,
          input.conversationId,
        )) {
          yield chunk;
        }
      } catch (error) {
        throw new ORPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to query package",
        });
      }
    }),
};
