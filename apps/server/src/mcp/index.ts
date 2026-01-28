import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { env } from "@kinetic-context/env/server";
import {
  listPackageConfigs,
  listProjectConfigs,
  readPackageConfig,
  readProjectConfig,
  ensureRepoAvailable,
  checkoutTag,
  queryOpencode,
  generateKctxHelperIfNeeded,
  type PackageConfig,
} from "@kinetic-context/server-utils";

export function createMcpServer(): McpServer {
  const mcpServer = new McpServer(
    {
      name: "kinetic-context",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // Tool: list_project_dependencies
  mcpServer.tool(
    "list_project_dependencies",
    "Lists the dependencies configured for a project. These dependencies can be queried using query_dependency to ask usage questions about how to use them.",
    {
      project_identifier: z.string().describe("The project identifier"),
    },
    async ({ project_identifier }): Promise<CallToolResult> => {
      try {
        const project = await readProjectConfig(
          env.PROJECTS_DIR,
          project_identifier,
        );

        if (!project) {
          return {
            content: [
              {
                type: "text",
                text: `Project "${project_identifier}" not found`,
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  project: project.identifier,
                  display_name: project.display_name,
                  dependencies: project.dependencies,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error listing project dependencies: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Tool: list_dependencies
  mcpServer.tool(
    "list_dependencies",
    "Lists all available dependencies that have been configured in the system. These dependencies can be queried using query_dependency to ask usage questions about how to use them.",
    {},
    async (): Promise<CallToolResult> => {
      try {
        const clonedPackages = await listPackageConfigs(env.PACKAGES_DIR);
        const localPackages = await listPackageConfigs(env.LOCAL_PACKAGES_DIR);
        const packages = [...clonedPackages, ...localPackages];

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                packages.map((pkg) => ({
                  identifier: pkg.identifier,
                  display_name: pkg.display_name,
                  package_manager: pkg.package_manager,
                })),
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error listing dependencies: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Tool: query_dependency
  mcpServer.tool(
    "query_dependency",
    "Ask questions about how to use a dependency. Analyzes the dependency's source code using OpenCode to provide intelligent answers about usage patterns, APIs, and best practices. This is for asking usage questions (e.g., 'How do I validate forms with zod?'), not for querying dependency metadata. The default timeout is 180 seconds (3 minutes). Only adjust the timeout when the user explicitly agrees. If you have multiple questions about different dependencies, ask each question independently using separate query_dependency calls. Call list_dependencies first to ensure the correct package identifier is used.",
    {
      project_identifier: z
        .string()
        .optional()
        .describe(
          "Optional project identifier. If provided and the project has a tag for this dependency, that tag will be checked out before querying",
        ),
      dependency_identifier: z
        .string()
        .describe("The dependency identifier to query"),
      query: z.string().describe("The question to ask about how to use the dependency"),
      sessionId: z
        .string()
        .optional()
        .describe(
          "Optional session ID to continue a previous conversation. If provided, the query will be added to the existing session, allowing for follow-up questions.",
        ),
      timeout: z
        .number()
        .optional()
        .describe(
          "Optional timeout in seconds. Default is 180 (3 minutes). Only set this if the user has agreed to a different timeout.",
        ),
    },
    async ({
      project_identifier,
      dependency_identifier,
      query,
      sessionId,
      timeout,
    }): Promise<CallToolResult> => {
      try {
        // Get package config from either directory (cloned first, then local)
        let packageConfig = await readPackageConfig(
          env.PACKAGES_DIR,
          dependency_identifier,
        );
        if (!packageConfig) {
          packageConfig = await readPackageConfig(
            env.LOCAL_PACKAGES_DIR,
            dependency_identifier,
          );
        }

        if (!packageConfig) {
          return {
            content: [
              {
                type: "text",
                text: `Dependency "${dependency_identifier}" not found`,
              },
            ],
            isError: true,
          };
        }

        // Determine which tag to use (only for cloned repos)
        let tag = packageConfig.default_tag;
        if (project_identifier) {
          const project = await readProjectConfig(
            env.PROJECTS_DIR,
            project_identifier,
          );
          if (project) {
            const dep = project.dependencies.find(
              (d) => d.identifier === dependency_identifier,
            );
            if (dep?.tag) {
              tag = dep.tag;
            }
          }
        }

        // Ensure repo is available (cloned or local); use correct packagesDir by storage_type
        const packagesDir =
          packageConfig.storage_type === "local"
            ? env.LOCAL_PACKAGES_DIR
            : env.PACKAGES_DIR;
        const repoPath = await ensureRepoAvailable(
          packageConfig.repo_path,
          packageConfig.storage_type,
          packageConfig.urls.git,
          packagesDir,
        );

        // Only checkout tag for cloned repos
        if (packageConfig.storage_type === "cloned" && tag) {
          await checkoutTag(repoPath, tag);
        }

        // Query opencode
        const timeoutMs = timeout != null ? timeout * 1000 : undefined;
        const kctxHelper = packageConfig.kctx_helper ?? "";
        const result = await queryOpencode(repoPath, query, sessionId, timeoutMs, kctxHelper);

        if (!sessionId && !kctxHelper.trim()) {
          void generateKctxHelperIfNeeded(packagesDir, dependency_identifier, repoPath);
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  response: result.response,
                  sessionId: result.sessionId,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error querying dependency: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  return mcpServer;
}