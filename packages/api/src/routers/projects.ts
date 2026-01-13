import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { publicProcedure } from "../index";
import type { Context } from "../context";
import { env } from "@kinetic-context/env/server";
// Note: These imports use relative paths because server utils aren't in a package
// In a real scenario, these would be in a shared package
import {
  listProjectConfigs,
  readProjectConfig,
  writeProjectConfig,
  deleteProjectConfig,
  type ProjectConfig,
  type ProjectDependency,
} from "../../../../apps/server/src/utils/config";

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
};
