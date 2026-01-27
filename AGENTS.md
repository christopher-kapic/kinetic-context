# kinetic-context

This project is an MCP server for **asking usage questions about open-source dependencies** by analyzing their source code.

Developers can pull and run the docker image locally, which exposes an MCP server to which they can connect their AI coding tools. This allows developers to ask questions about how to use their project dependencies without needing to maintain local copies of all dependency source code.

The server clones repositories for dependencies and uses [opencode](https://github.com/opencode-dev/opencode) (an AI code editor) to analyze the dependency's source code and answer questions about how to use them.

**Important:** kinetic-context is designed for asking **usage questions** about dependencies (e.g., "How do I validate forms with zod?"), not for querying dependency metadata (like package.json contents). The system analyzes the actual source code to provide intelligent answers.

There is also a frontend that developers can access in their browsers to create projects and manage which dependencies are referenced.

For now, there is no auth or database, since the intention is that developers will run the code locally.

## Server Routes

- The web app is served from the server at the root route (`/`)
- The MCP server is exposed at `/mcp`

## MCP Server Tools

The MCP server exposes the following tools for **asking usage questions about dependencies**:

- **list_project_dependencies**: Lists the dependencies configured for a project. These dependencies can then be queried using `query_dependency` to ask usage questions. Takes a project identifier (required).

- **list_dependencies**: Lists all available dependencies that have been configured in the system. These dependencies can then be queried using `query_dependency` to ask usage questions. Agents can use this to let a user know if they want to ask questions about a dependency that isn't configured for a project, or to get the correct package identifier.

- **query_dependency**: **Ask questions about how to use a dependency.** Analyzes the dependency's source code using OpenCode to provide intelligent answers about usage patterns, APIs, and best practices. Takes a project identifier (optional), a dependency identifier (required), and a query (required). If the project identifier is specified and there is a tag for the dependency for the project, the cloned repo at `/packages/{repo}/` should checkout the specified tag before handling the query. This is for asking usage questions (e.g., "How do I validate forms with zod?"), not for querying dependency metadata.

**Multiple Dependencies:** If you have questions about multiple dependencies, ask each question independently using separate `query_dependency` calls. For example, if you want to understand how zod and react-hook-form work together:
1. First ask `query_dependency` about zod: "How do I create validation schemas with zod?"
2. Then ask `query_dependency` about react-hook-form: "How do I integrate validation with react-hook-form?"
3. If needed, ask follow-up questions to either dependency using the same `sessionId` to maintain context

This approach provides better results than trying to ask about multiple dependencies in a single query.

### Example Questions

Good questions to ask with `query_dependency`:
- "How do I validate an email address with zod?"
- "What's the best way to use react-hook-form with TypeScript?"
- "How do I create a custom validator in zod?"
- "What are the available options for useForm in react-hook-form?"
- "How do I create validation schemas with zod?" (first question when learning about zod + react-hook-form integration)
- "How do I integrate validation with react-hook-form?" (follow-up question for integration)

## Web Frontend

In the web frontend, calling oRPC procedures should be done according to the Tanstack query docs. You can reference the TANSTACKQUERY.md file for that.

## Usage

This project is designed to be used as an MCP server. Developers connect their AI coding tools to the MCP endpoint to **ask questions about how to use dependencies**. The server handles cloning and managing dependency repositories, then analyzes the source code using OpenCode to answer usage questions. Developers don't need to maintain local copies of dependency source code.

## Docker Configuration

The docker container requires two volumes:

1. **Data volume** (`/data`) - Contains both `/packages` and `/projects` subdirectories
2. **Config volume** (`/config`) - Contains `opencode.json` configuration file for OpenCode

### Data Volume Structure

The data volume should be mounted at `/data` with the following structure:

```
/data
  /packages
    /example-dependency-1 # git repo
    example-dependency-1.json # config
    /example-dependency-2
    example-dependency-2.json # config
  /projects
    projectname.json
```

### Config Volume

The config volume should be mounted at `/config` and contain a single file:

```
/config
  opencode.json # OpenCode configuration file
```

### OpenCode Configuration

OpenCode is included in the Docker container to avoid conflicts with users' development environments. The `opencode.json` file in the config volume controls which model and provider OpenCode uses.

Example `opencode.json` for OpenRouter:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "openrouter": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "OpenRouter",
      "options": {
        "baseURL": "https://openrouter.ai/api/v1",
        "apiKey": "your-api-key-here"
      },
      "models": {
        "openrouter/anthropic/claude-3.5-sonnet": {
          "name": "Claude 3.5 Sonnet"
        }
      }
    }
  },
  "model": "openrouter/anthropic/claude-3.5-sonnet"
}
```

The config file supports any provider that OpenCode supports. See the [OpenCode providers documentation](https://opencode.ai/docs/providers) for more details.

## Package Config Format

The JSON config files in `/packages` should look like this example (note: comments shown are for reference only - JSON files do not support comments):

```json
{
  "identifier": "@hookform/resolvers",
  "package_manager": "npm",
  "display_name": "React Hook Form - Resolvers",
  "default_tag": "master",
  "urls": {
    "website": "https://react-hook-form.com/",
    "docs": "https://react-hook-form.com/docs/useform#resolver",
    "git_browser": "https://github.com/react-hook-form/resolvers",
    "git": "git@github.com:react-hook-form/resolvers.git",
    "logo": ""
  }
}
```

Field descriptions:
- `identifier` (required): Unique identifier for the package
- `package_manager` (required): Package manager (e.g., "npm", "pnpm", "yarn")
- `display_name` (required): Human-readable name for the package
- `default_tag` (required): Default git tag/branch to use when cloning
- `urls.website` (optional): Link to package website
- `urls.docs` (optional): Link to package documentation
- `urls.git_browser` (optional): Link to view repo in browser
- `urls.git` (required): Git URL to clone the repository (can be https:// or ssh)
- `urls.logo` (optional): Link to logo image file

## Project Config Format

The JSON config files in `/projects` should look like this example (note: comments shown are for reference only - JSON files do not support comments):

```json
{
  "identifier": "my-project",
  "display_name": "My Project",
  "urls": {
    "website": "https://my-project.com",
    "git_browser": "",
    "git": "",
    "logo": ""
  },
  "dependencies": [
    {
      "identifier": "@hookform/resolvers",
      "tag": "master"
    }
  ]
}
```

Field descriptions:
- `identifier` (required): Unique identifier for the project. When calling the MCP, the directory of the project in which the developer is working should match the project identifier in kinetic-context.
- `display_name` (required): Human-readable name for the project
- `urls.website` (optional): Link to project website
- `urls.git_browser` (optional): Link to view repo in browser
- `urls.git` (optional): Git URL for the project
- `urls.logo` (optional): Link to logo image file
- `dependencies` (required): Array of dependency objects, each containing:
  - `identifier` (required): Must match a package identifier from `/packages`
  - `tag` (optional): Git tag/branch to use for this dependency in this project. If not specified, uses the package's `default_tag`
