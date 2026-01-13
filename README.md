# kinetic-context

An MCP server for getting information about open-source dependencies. This project provides a Docker image that developers can pull and run locally, exposing an MCP server that AI coding tools can connect to for querying dependency information.

## Features

- **MCP Server** - Model Context Protocol server for dependency queries
- **TypeScript** - For type safety and improved developer experience
- **TanStack Router** - File-based routing with full type safety
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **shadcn/ui** - Reusable UI components
- **Hono** - Lightweight, performant server framework
- **oRPC** - End-to-end type-safe APIs with OpenAPI integration
- **OpenCode Integration** - Uses OpenCode AI to answer questions about dependencies
- **Turborepo** - Optimized monorepo build system

## Getting Started

### Prerequisites

- Node.js 20 or later
- pnpm 10.20.0 or later

### Environment Setup

Create a `.env` file in the root directory:

```env
# Server Configuration
CORS_ORIGIN=http://localhost:3000
NODE_ENV=development

# Data Directories (for local development)
PACKAGES_DIR=./data/packages
PROJECTS_DIR=./data/projects

# OpenCode Configuration
OPENCODE_CONFIG_PATH=./config/opencode.json
OPENCODE_URL=http://localhost:7168  # URL of your opencode instance (default: http://opencode:4096 for Docker)
```

### Local Development

First, install the dependencies:

```bash
pnpm install
```

Create the necessary directories:

```bash
mkdir -p data/packages data/projects config
```

Create an `opencode.json` config file in the `config` directory (see [OpenCode Configuration](#opencode-configuration) below).

**Note:** For local development, you'll need a running opencode instance. You can either:
- Use Docker Compose to run opencode: `docker compose up opencode -d` (uses the `compose.yaml` in the root), then set `OPENCODE_URL=http://localhost:7168` in your `.env` file
- Run opencode via Docker directly: `docker run -d -p 7168:4096 -v $(pwd)/config:/config -v $(pwd)/data:/data ghcr.io/anomalyco/opencode:latest serve --hostname=0.0.0.0`
- Run opencode locally if you have it set up

Then, run the development server:

```bash
pnpm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. Both the web application and API are served from the same port in development mode.

## Project Structure

```
kinetic-context/
├── apps/
│   ├── docs/        # Documentation site (Next.js + Fumadocs)
│   ├── web/         # Frontend application (React + TanStack Router)
│   └── server/      # Backend API (Hono, ORPC)
├── packages/
│   ├── api/         # API layer / business logic
│   ├── config/      # Shared TypeScript configuration
│   └── env/         # Environment variable validation
```

## OpenCode Configuration

OpenCode is used to answer questions about dependencies. Create a `config/opencode.json` file to configure the model and provider. Here's an example configuration for OpenRouter:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "openrouter": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "OpenRouter",
      "options": {
        "baseURL": "https://openrouter.ai/api/v1",
        "apiKey": "your-openrouter-api-key-here"
      },
      "models": {
        "openrouter/anthropic/claude-3.5-sonnet": {
          "name": "Claude 3.5 Sonnet"
        },
        "openrouter/anthropic/claude-3-opus": {
          "name": "Claude 3 Opus"
        }
      }
    }
  },
  "model": "openrouter/anthropic/claude-3.5-sonnet"
}
```

You can configure any provider supported by OpenCode. See the [OpenCode documentation](https://opencode.ai/docs/providers) for more details.

**Note:** In production (Docker), the config file should be mounted as a volume at `/config/opencode.json`.

## Documentation

This project includes a documentation site built with [Next.js](https://nextjs.org/) and [Fumadocs](https://fumadocs.dev). The documentation app is located in `apps/docs`.

### Building Documentation Locally

To build the documentation site:

```bash
# From the root directory
pnpm build:docs

# Or from the docs directory
cd apps/docs
pnpm build
```

The built site will be in `apps/docs/.next`. To preview the production build:

```bash
cd apps/docs
pnpm start
```

For local development:

```bash
cd apps/docs
pnpm dev
```

See [Deploying Documentation](#deploying-documentation) for instructions on deploying to Vercel.

## Docker

### Building the Image

Build the Docker image:

```bash
docker build -t kinetic-context .
```

### Running with Docker

kinetic-context requires two services: **opencode** and **kinetic-context**. The Docker setup requires two volumes:

1. **Data volume** - Contains `/packages` and `/projects` subdirectories
2. **Config volume** - Contains `opencode.json` configuration file

Example directory structure for the data volume:

```
/data
  /packages
    /example-dependency-1  # git repo
    example-dependency-1.json  # config
    /example-dependency-2
    example-dependency-2.json
  /projects
    my-project.json
```

**Important:** Before running, you must authenticate to GitHub Container Registry to pull the opencode image:

```bash
docker login ghcr.io
```

You'll need a GitHub Personal Access Token with `read:packages` permission. See the [Getting Started guide](/docs/getting-started) for details.

#### Using Docker Compose (Recommended)

The repository includes a `compose.yaml` file in the root directory. You can use it directly:

```bash
docker compose up -d
```

Or create your own `compose.yaml` with the following configuration:

```yaml
version: '3.8'

services:
  opencode:
    image: ghcr.io/anomalyco/opencode:latest
    ports:
      - "7168:4096"
    volumes:
      - ./config:/config
      - ./data:/data
    command: ["serve", "--hostname=0.0.0.0"]
    environment:
      - OPENCODE_CONFIG=/config/opencode.json
      - XDG_STATE_HOME=/config/.local # separate .local/share/opencode from regular opencode instance
    restart: unless-stopped

  kinetic-context:
    build: .
    ports:
      - "7167:3000"
    volumes:
      - ./data:/data
      - ./config:/config
    environment:
      - CORS_ORIGIN=http://localhost:7167
      - NODE_ENV=production
      - PACKAGES_DIR=/data/packages
      - PROJECTS_DIR=/data/projects
      - OPENCODE_CONFIG_PATH=/config/opencode.json
      - OPENCODE_URL=http://opencode:4096
    depends_on:
      - opencode
    restart: unless-stopped
```

Access the web UI at [http://localhost:7167](http://localhost:7167).

#### Using Docker Run

For a single container setup (without opencode), you would need to run opencode separately. However, Docker Compose is recommended as it manages both services together.

### Environment Variables

The following environment variables can be set for the kinetic-context service:

- `CORS_ORIGIN` (required) - CORS origin URL
- `NODE_ENV` (optional) - `development` or `production` (default: `development`)
- `PACKAGES_DIR` (optional) - Path to packages directory (default: `/data/packages`)
- `PROJECTS_DIR` (optional) - Path to projects directory (default: `/data/projects`)
- `OPENCODE_CONFIG_PATH` (optional) - Path to opencode.json config (default: `/config/opencode.json`)
- `OPENCODE_URL` (required in Docker) - URL of the opencode service (default: `http://opencode:4096` in Docker, or set to your local opencode instance URL for development)

## Available Scripts

- `pnpm run dev`: Start all applications in development mode (web app and API on port 3000)
- `pnpm run build`: Build all applications
- `pnpm run build:docs`: Build only the documentation site
- `pnpm run dev:web`: Start only the web application
- `pnpm run dev:server`: Start only the server
- `pnpm run check-types`: Check TypeScript types across all apps

## Deploying Documentation

The documentation site can be deployed to [Vercel](https://vercel.com) with minimal configuration.

### Prerequisites

- A Vercel account
- Your repository connected to Vercel (via GitHub integration)

### Configuration Steps

1. **Import your repository** in the Vercel dashboard
2. **Configure the project settings**:
   - **Root Directory**: Set to `apps/docs`
   - **Framework Preset**: Next.js (should auto-detect)
   - **Build Command**: `pnpm build` (or `pnpm build:docs` from root)
   - **Output Directory**: `.next` (default for Next.js)
   - **Install Command**: `pnpm install`

3. **Environment Variables**: No environment variables are required for the docs app

4. **Deploy**: Click "Deploy" and Vercel will build and deploy your documentation site

### Monorepo Notes

Vercel automatically detects pnpm workspaces, so it will:
- Install dependencies from the root `package.json`
- Use the correct pnpm version (10.20.0 as specified in `packageManager`)
- Build the Next.js app in the `apps/docs` directory

The documentation will be available at your Vercel deployment URL (e.g., `https://your-project.vercel.app`).
