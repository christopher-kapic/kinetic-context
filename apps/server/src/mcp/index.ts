import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { env } from "@kinetic-context/env/server";
import {
  listPackageConfigs,
  listProjectConfigs,
  readPackageConfig,
  readProjectConfig,
  type PackageConfig,
} from "../utils/config.js";
import { ensureRepoAvailable, checkoutTag } from "../utils/git.js";
import { queryOpencode } from "../utils/opencode.js";

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
    "Lists the dependencies for a project",
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
    "Lists all available dependencies",
    {},
    async (): Promise<CallToolResult> => {
      try {
        const packages = await listPackageConfigs(env.PACKAGES_DIR);

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
    "Queries a dependency to answer questions about how to use it. Call list_dependencies first to ensure the correct package identifier is used.",
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
      query: z.string().describe("The question to ask about the dependency"),
      sessionId: z
        .string()
        .optional()
        .describe(
          "Optional session ID to continue a previous conversation. If provided, the query will be added to the existing session, allowing for follow-up questions.",
        ),
    },
    async ({
      project_identifier,
      dependency_identifier,
      query,
      sessionId,
    }): Promise<CallToolResult> => {
      try {
        // Get package config
        const packageConfig = await readPackageConfig(
          env.PACKAGES_DIR,
          dependency_identifier,
        );

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

        // Ensure repo is available (cloned or local)
        const repoPath = await ensureRepoAvailable(
          packageConfig.repo_path,
          packageConfig.storage_type,
          packageConfig.urls.git,
          env.PACKAGES_DIR,
        );

        // Only checkout tag for cloned repos
        if (packageConfig.storage_type === "cloned" && tag) {
          await checkoutTag(repoPath, tag);
        }

        // Query opencode
        const result = await queryOpencode(repoPath, query, sessionId);

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

  // Tool: query_dependencies
  mcpServer.tool(
    "query_dependencies",
    "Queries multiple dependencies to answer questions about how they work together",
    {
      project_identifier: z
        .string()
        .optional()
        .describe(
          "Optional project identifier. If provided and the project has tags for these dependencies, those tags will be checked out before querying",
        ),
      dependency_identifiers: z
        .array(z.string())
        .describe("List of dependency identifiers to query"),
      query: z
        .string()
        .describe(
          "The question to ask about how the dependencies work together",
        ),
      sessionId: z
        .string()
        .optional()
        .describe(
          "Optional session ID to continue a previous conversation. If provided, the query will be added to the existing session, allowing for follow-up questions.",
        ),
    },
    async ({
      project_identifier,
      dependency_identifiers,
      query,
      sessionId,
    }): Promise<CallToolResult> => {
      try {
        // Get all package configs
        const packageConfigs: PackageConfig[] = [];
        for (const identifier of dependency_identifiers) {
          const config = await readPackageConfig(
            env.PACKAGES_DIR,
            identifier,
          );
          if (!config) {
            return {
              content: [
                {
                  type: "text",
                  text: `Dependency "${identifier}" not found`,
                },
              ],
              isError: true,
            };
          }
          packageConfigs.push(config);
        }

        // Get project config if provided
        let project = null;
        if (project_identifier) {
          project = await readProjectConfig(
            env.PROJECTS_DIR,
            project_identifier,
          );
        }

        // Ensure all repos are available and checked out to correct tags (only for cloned)
        const repoPaths: string[] = [];
        for (let i = 0; i < packageConfigs.length; i++) {
          const config = packageConfigs[i];
          const identifier = dependency_identifiers[i];

          // Determine tag (only for cloned repos)
          let tag = config.default_tag;
          if (project) {
            const dep = project.dependencies.find(
              (d) => d.identifier === identifier,
            );
            if (dep?.tag) {
              tag = dep.tag;
            }
          }

          // Ensure repo is available (cloned or local)
          const repoPath = await ensureRepoAvailable(
            config.repo_path,
            config.storage_type,
            config.urls.git,
            env.PACKAGES_DIR,
          );

          // Only checkout tag for cloned repos
          if (config.storage_type === "cloned" && tag) {
            await checkoutTag(repoPath, tag);
          }

          repoPaths.push(repoPath);
        }

        // Build query with context about all repos
        const repoContext = repoPaths
          .map((path, i) => `${dependency_identifiers[i]}: ${path}`)
          .join("\n");

        const fullQuery = `${query}\n\nRepository paths:\n${repoContext}`;

        // Query opencode with the first repo as primary context
        // In a more sophisticated implementation, we might combine all repos
        const result = await queryOpencode(repoPaths[0], fullQuery, sessionId);

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
              text: `Error querying dependencies: ${
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