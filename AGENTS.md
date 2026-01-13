# kinetic-context

This project is an MCP server for getting information about open-source dependencies.

Developers can pull and run the docker image locally, which exposes an MCP server to which they can connect their AI coding tools. This allows developers to query information about their project dependencies without needing to maintain local copies of all dependency source code.

The server clones repositories for dependencies and uses [opencode](https://github.com/opencode-dev/opencode) (an AI code editor) to answer questions about how to use dependencies.

There is also a frontend that developers can access in their browsers to create projects and manage which dependencies are referenced.

For now, there is no auth or database, since the intention is that developers will run the code locally.

## Server Routes

- The web app is served from the server at the root route (`/`)
- The MCP server is exposed at `/mcp`

## MCP Server Tools

The MCP server exposes the following tools:

- **list_project_dependencies**: Lists the dependencies for a project. Takes a project identifier (required).
- **list_dependencies**: Lists all available dependencies. Agents can use this to let a user know if they want to ask questions about a dependency that isn't configured for a project.
- **query_dependency**: Takes a project identifier (optional), a dependency identifier (required), and a query (required). If the project identifier is specified and there is a tag for the dependency for the project, the cloned repo at `/packages/{repo}/` should checkout the specified tag before handling the query.
- **query_dependencies**: Takes a project identifier (optional), a list of dependency identifiers (required), and a query. This works just like `query_dependency`, but can be used to ask questions about how multiple dependencies work together. Agents should prefer to use `query_dependency` multiple times, but this endpoint exists for cases where there are problems with multiple `query_dependency` calls.

## Web Frontend

In the web frontend, calling oRPC procedures should be done according to the Tanstack query docs. You can reference the TANSTACKQUERY.md file for that.

## Usage

This project is designed to be used as an MCP server. Developers connect their AI coding tools to the MCP endpoint to query information about dependencies. The server handles cloning and managing dependency repositories, so developers don't need to maintain local copies of dependency source code.

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
