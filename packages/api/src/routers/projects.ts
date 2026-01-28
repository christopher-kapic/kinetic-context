import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { publicProcedure } from "../index";
import type { Context } from "../context";
import { env } from "@kinetic-context/env/server";
import {
  listProjectConfigs,
  readProjectConfig,
  writeProjectConfig,
  deleteProjectConfig,
  discoverGitRepositories,
  type ProjectConfig,
  type ProjectDependency,
} from "@kinetic-context/server-utils";

const CreateProjectInputSchema = z.object({
  identifier: z.string().min(1),
  display_name: z.string().min(1),
  urls: z.object({
    website: z.string().optional(),
    git_browser: z.string().optional(),
    git: z.string().optional(),
    logo: z.string().optional(),
  }),
});

const UpdateProjectInputSchema = z.object({
  identifier: z.string().min(1),
  display_name: z.string().min(1).optional(),
  urls: z
    .object({
      website: z.string().optional(),
      git_browser: z.string().optional(),
      git: z.string().optional(),
      logo: z.string().optional(),
    })
    .optional(),
});

const AddDependencyInputSchema = z.object({
  projectIdentifier: z.string().min(1),
  dependency: z.object({
    identifier: z.string().min(1),
    tag: z.string().optional(),
  }),
});

const RemoveDependencyInputSchema = z.object({
  projectIdentifier: z.string().min(1),
  dependencyIdentifier: z.string().min(1),
});

const UpdateDependenciesInputSchema = z.object({
  projectIdentifier: z.string().min(1),
  toAdd: z
    .array(
      z.object({
        identifier: z.string().min(1),
        tag: z.string().optional(),
      })
    )
    .optional(),
  toRemove: z.array(z.string().min(1)).optional(),
  toUpdate: z
    .array(
      z.object({
        identifier: z.string().min(1),
        tag: z.string().optional(),
      })
    )
    .optional(),
});

export const projectsRouter = {
  list: publicProcedure.handler(async () => {
    const projects = await listProjectConfigs(env.PROJECTS_DIR);
    return projects;
  }),

  get: publicProcedure
    .input(z.object({ identifier: z.string() }))
    .handler(async ({ input }) => {
      const project = await readProjectConfig(env.PROJECTS_DIR, input.identifier);
      if (!project) {
        throw new ORPCError({
          code: "NOT_FOUND",
          message: `Project with identifier "${input.identifier}" not found`,
        });
      }
      return project;
    }),

  create: publicProcedure
    .input(CreateProjectInputSchema)
    .handler(async ({ input }) => {
      // Check if project already exists
      const existing = await readProjectConfig(env.PROJECTS_DIR, input.identifier);
      if (existing) {
        throw new ORPCError({
          code: "CONFLICT",
          message: `Project with identifier "${input.identifier}" already exists`,
        });
      }

      const project: ProjectConfig = {
        identifier: input.identifier,
        display_name: input.display_name,
        urls: input.urls,
        dependencies: [],
      };

      await writeProjectConfig(env.PROJECTS_DIR, project);
      return project;
    }),

  update: publicProcedure
    .input(UpdateProjectInputSchema)
    .handler(async ({ input }) => {
      const existing = await readProjectConfig(env.PROJECTS_DIR, input.identifier);
      if (!existing) {
        throw new ORPCError({
          code: "NOT_FOUND",
          message: `Project with identifier "${input.identifier}" not found`,
        });
      }

      const updated: ProjectConfig = {
        ...existing,
        display_name: input.display_name ?? existing.display_name,
        urls: input.urls ? { ...existing.urls, ...input.urls } : existing.urls,
      };

      await writeProjectConfig(env.PROJECTS_DIR, updated);
      return updated;
    }),

  delete: publicProcedure
    .input(z.object({ identifier: z.string() }))
    .handler(async ({ input }) => {
      const existing = await readProjectConfig(env.PROJECTS_DIR, input.identifier);
      if (!existing) {
        throw new ORPCError({
          code: "NOT_FOUND",
          message: `Project with identifier "${input.identifier}" not found`,
        });
      }

      await deleteProjectConfig(env.PROJECTS_DIR, input.identifier);
      return { success: true };
    }),

  addDependency: publicProcedure
    .input(AddDependencyInputSchema)
    .handler(async ({ input }) => {
      const project = await readProjectConfig(
        env.PROJECTS_DIR,
        input.projectIdentifier
      );
      if (!project) {
        throw new ORPCError({
          code: "NOT_FOUND",
          message: `Project with identifier "${input.projectIdentifier}" not found`,
        });
      }

      // Check if dependency already exists
      const existingDep = project.dependencies.find(
        (d) => d.identifier === input.dependency.identifier
      );
      if (existingDep) {
        throw new ORPCError({
          code: "CONFLICT",
          message: `Dependency "${input.dependency.identifier}" already exists in project`,
        });
      }

      const updated: ProjectConfig = {
        ...project,
        dependencies: [...project.dependencies, input.dependency],
      };

      await writeProjectConfig(env.PROJECTS_DIR, updated);
      return updated;
    }),

  removeDependency: publicProcedure
    .input(RemoveDependencyInputSchema)
    .handler(async ({ input }) => {
      const project = await readProjectConfig(
        env.PROJECTS_DIR,
        input.projectIdentifier
      );
      if (!project) {
        throw new ORPCError({
          code: "NOT_FOUND",
          message: `Project with identifier "${input.projectIdentifier}" not found`,
        });
      }

      const updated: ProjectConfig = {
        ...project,
        dependencies: project.dependencies.filter(
          (d) => d.identifier !== input.dependencyIdentifier
        ),
      };

      await writeProjectConfig(env.PROJECTS_DIR, updated);
      return updated;
    }),

  updateDependencies: publicProcedure
    .input(UpdateDependenciesInputSchema)
    .handler(async ({ input }) => {
      // Read project config once (atomic read)
      const project = await readProjectConfig(
        env.PROJECTS_DIR,
        input.projectIdentifier
      );
      if (!project) {
        throw new ORPCError({
          code: "NOT_FOUND",
          message: `Project with identifier "${input.projectIdentifier}" not found`,
        });
      }

      // Start with current dependencies
      let updatedDependencies = [...project.dependencies];

      // Apply removals first (idempotent - ignore if not found)
      if (input.toRemove && input.toRemove.length > 0) {
        const removeSet = new Set(input.toRemove);
        updatedDependencies = updatedDependencies.filter(
          (d) => !removeSet.has(d.identifier)
        );
      }

      // Apply additions (check for duplicates)
      if (input.toAdd && input.toAdd.length > 0) {
        const existingIdentifiers = new Set(
          updatedDependencies.map((d) => d.identifier)
        );
        const duplicates: string[] = [];

        for (const newDep of input.toAdd) {
          if (existingIdentifiers.has(newDep.identifier)) {
            duplicates.push(newDep.identifier);
          } else {
            updatedDependencies.push(newDep);
            existingIdentifiers.add(newDep.identifier);
          }
        }

        // If there are duplicates, throw an error with details
        if (duplicates.length > 0) {
          throw new ORPCError({
            code: "CONFLICT",
            message: `Dependencies already exist: ${duplicates.join(", ")}`,
            data: { duplicates },
          });
        }
      }

      // Apply tag updates to existing dependencies
      if (input.toUpdate && input.toUpdate.length > 0) {
        const updateByIdentifier = new Map(
          input.toUpdate.map((u) => [u.identifier, u.tag]),
        );
        updatedDependencies = updatedDependencies.map((d) => {
          if (!updateByIdentifier.has(d.identifier)) return d;
          const tag = updateByIdentifier.get(d.identifier);
          return { ...d, tag };
        });
      }

      // Write updated config once (atomic write)
      const updated: ProjectConfig = {
        ...project,
        dependencies: updatedDependencies,
      };

      await writeProjectConfig(env.PROJECTS_DIR, updated);
      return updated;
    }),

  scanProjects: publicProcedure.handler(async () => {
    // Recursively scan projects directory for git repositories
    const discoveredRepos = await discoverGitRepositories(env.PROJECTS_DIR);
    
    // For each discovered repo, create a suggested project config
    const suggestions = await Promise.all(
      discoveredRepos.map(async (repo) => {
        // Extract directory name from path
        const pathParts = repo.relativePath.split("/").filter(p => p.length > 0);
        const dirName = pathParts.length > 0 
          ? pathParts[pathParts.length - 1] 
          : `repo-${Date.now()}`;
        
        // Identifier is lowercase version of directory name
        const suggestedIdentifier = dirName.toLowerCase();
        
        // Display name is the directory name
        const suggestedDisplayName = dirName;
        
        // Check if a project with this identifier already exists
        const existing = await readProjectConfig(env.PROJECTS_DIR, suggestedIdentifier);
        
        return {
          path: repo.path,
          relativePath: repo.relativePath,
          suggestedIdentifier,
          suggestedDisplayName,
          alreadyExists: !!existing,
        };
      })
    );
    
    return suggestions;
  }),
};
