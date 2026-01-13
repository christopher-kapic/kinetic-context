import { z } from "zod";
import { ORPCError, eventIterator } from "@orpc/server";
import { publicProcedure } from "../index";
import { env } from "@kinetic-context/env/server";
// Note: These imports use relative paths because server utils aren't in a package
import {
  listPackageConfigs,
  readPackageConfig,
  writePackageConfig,
  deletePackageConfig,
  type PackageConfig,
} from "../../../../apps/server/src/utils/config";
import { ensureRepoCloned, ensureRepoAvailable, checkoutTag, getRepoIdentifierFromUrl } from "../../../../apps/server/src/utils/git";
import { join } from "node:path";
import { queryOpencodeStream, type OpencodeModel } from "../../../../apps/server/src/utils/opencode";
import { readOpencodeConfig } from "../../../../apps/server/src/utils/config";

// In-memory clone status tracking
const cloneStatus = new Map<
  string,
  "pending" | "cloning" | "completed" | "error"
>();

const CreatePackageInputSchema = z.object({
  identifier: z.string().min(1),
  package_manager: z.string(), // Can be empty
  display_name: z.string().min(1),
  storage_type: z.enum(["cloned", "existing"]),
  repo_path: z.string().optional(), // Only required for existing repos, calculated for cloned
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
  // If existing, repo_path is required
  if (data.storage_type === "existing" && !data.repo_path) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Repository path is required for existing repositories",
      path: ["repo_path"],
    });
  }
});

const UpdatePackageInputSchema = z.object({
  identifier: z.string().min(1),
  package_manager: z.string().min(1).optional(),
  display_name: z.string().min(1).optional(),
  storage_type: z.enum(["cloned", "existing"]).optional(),
  repo_path: z.string().min(1).optional(),
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
      const { getDefaultBranch, checkoutTag } = await import("../../../../apps/server/src/utils/git");
      const { writePackageConfig, readPackageConfig } = await import("../../../../apps/server/src/utils/config");
      
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
      const { checkoutTag } = await import("../../../../apps/server/src/utils/git");
      await checkoutTag(actualRepoPath, defaultTag);
    }
    
    // Update the package config with the actual repo path (in case it was different)
    const { writePackageConfig, readPackageConfig } = await import("../../../../apps/server/src/utils/config");
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
    const packages = await listPackageConfigs(env.PACKAGES_DIR);
    return packages.map((pkg) => ({
      ...pkg,
      cloneStatus: cloneStatus.get(pkg.identifier) ?? "completed",
    }));
  }),

  get: publicProcedure
    .input(z.object({ identifier: z.string() }))
    .handler(async ({ input }) => {
      const pkg = await readPackageConfig(env.PACKAGES_DIR, input.identifier);
      if (!pkg) {
        throw new ORPCError({
          code: "NOT_FOUND",
          message: `Package with identifier "${input.identifier}" not found`,
        });
      }
      return {
        ...pkg,
        cloneStatus: cloneStatus.get(pkg.identifier) ?? "completed",
      };
    }),

  create: publicProcedure
    .input(CreatePackageInputSchema)
    .handler(async ({ input }) => {
      // Check if package already exists
      const existing = await readPackageConfig(env.PACKAGES_DIR, input.identifier);
      if (existing) {
        throw new ORPCError({
          code: "CONFLICT",
          message: `Package with identifier "${input.identifier}" already exists`,
        });
      }

      // Determine repo_path based on storage_type
      let repoPath: string;
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
      } else {
        // For existing repos, use the provided path
        repoPath = input.repo_path;
      }

      const pkg: PackageConfig = {
        identifier: input.identifier,
        package_manager: input.package_manager,
        display_name: input.display_name,
        storage_type: input.storage_type,
        repo_path: repoPath,
        default_tag: input.default_tag,
        urls: input.urls,
      };

      // Write config file immediately
      await writePackageConfig(env.PACKAGES_DIR, pkg);

      // Start async clone only for cloned repos (don't await)
      if (input.storage_type === "cloned" && input.urls.git) {
        cloneStatus.set(input.identifier, "pending");
        cloneRepository(input.identifier, repoPath, input.urls.git, input.default_tag).catch(
          (error) => {
            console.error(`Background clone failed for ${input.identifier}:`, error);
          }
        );
      } else {
        // For existing repos, mark as completed immediately
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
      const existing = await readPackageConfig(env.PACKAGES_DIR, input.identifier);
      if (!existing) {
        throw new ORPCError({
          code: "NOT_FOUND",
          message: `Package with identifier "${input.identifier}" not found`,
        });
      }

      const updated: PackageConfig = {
        ...existing,
        package_manager: input.package_manager ?? existing.package_manager,
        display_name: input.display_name ?? existing.display_name,
        storage_type: input.storage_type ?? existing.storage_type,
        repo_path: input.repo_path ?? existing.repo_path,
        default_tag: input.default_tag ?? existing.default_tag,
        urls: input.urls ? { ...existing.urls, ...input.urls } : existing.urls,
      };

      await writePackageConfig(env.PACKAGES_DIR, updated);
      return {
        ...updated,
        cloneStatus: cloneStatus.get(updated.identifier) ?? "completed",
      };
    }),

  delete: publicProcedure
    .input(z.object({ identifier: z.string() }))
    .handler(async ({ input }) => {
      const existing = await readPackageConfig(env.PACKAGES_DIR, input.identifier);
      if (!existing) {
        throw new ORPCError({
          code: "NOT_FOUND",
          message: `Package with identifier "${input.identifier}" not found`,
        });
      }

      await deletePackageConfig(env.PACKAGES_DIR, input.identifier);
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
    
    return models;
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
        }),
      ),
    )
    .handler(async function* ({ input }) {
      // Get package config
      const pkg = await readPackageConfig(env.PACKAGES_DIR, input.identifier);
      if (!pkg) {
        throw new ORPCError({
          code: "NOT_FOUND",
          message: `Package with identifier "${input.identifier}" not found`,
        });
      }

      // Ensure repo is available (cloned or existing)
      const repoPath = await ensureRepoAvailable(
        pkg.repo_path,
        pkg.storage_type,
        pkg.urls.git,
        env.PACKAGES_DIR,
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
