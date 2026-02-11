#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
KCTX_HOME="$HOME/.kctx"
BIN_DIR="$KCTX_HOME/bin"
OPencode_CONFIG_DIR="$KCTX_HOME/opencode/config"
OPencode_STATE_DIR="$KCTX_HOME/opencode/state"
PACKAGES_DIR="$KCTX_HOME/packages"
PROJECTS_DIR="$KCTX_HOME/projects"
LOCAL_PACKAGES_DIR="$KCTX_HOME/local-packages"
COMPOSE_FILE="$KCTX_HOME/compose.yaml"
KCTX_SCRIPT="$BIN_DIR/kctx"
GITHUB_RAW_URL="https://raw.githubusercontent.com/christopher-kapic/kinetic-context/master"

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  kinetic-context Installation Script  ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# Detect container runtime (docker or podman)
detect_container_runtime() {
  if command -v docker >/dev/null 2>&1; then
    echo "docker"
  elif command -v podman >/dev/null 2>&1; then
    echo "podman"
  else
    echo "none"
  fi
}

# Check if ghcr.io image is available (not denied/unauthorized)
check_ghcr_available() {
  local cmd="$1"
  echo "Checking ghcr.io access..." >&2
  if $cmd pull ghcr.io/anomalyco/opencode:latest 2>&1 | grep -qiE "denied|unauthorized|not found|authentication"; then
    echo "ghcr.io access not available (authentication required or image not found)" >&2
    return 1
  fi
  echo "ghcr.io access available" >&2
  return 0
}

# Check if local OpenCode image exists
check_local_opencode_image() {
  local cmd="$1"
  if $cmd image inspect opencode:local >/dev/null 2>&1; then
    echo "Local OpenCode image found" >&2
    return 0
  fi
  echo "Local OpenCode image not found" >&2
  return 1
}

# Ensure bun is installed (prompt user)
ensure_bun_installed() {
  if command -v bun >/dev/null 2>&1; then
    echo "bun is already installed"
    return 0
  fi

  echo ""
  echo -e "${YELLOW}bun is not installed.${NC}"
  echo "bun is required to build OpenCode from source."
  echo ""
  read -p "Install bun now? (Y/n): " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]?$ ]] || [[ -z $REPLY ]]; then
    echo "Installing bun..."
    curl -fsSL https://bun.sh/install | bash
    export PATH="$HOME/.bun/bin:$PATH"
    if command -v bun >/dev/null 2>&1; then
      echo "bun installed successfully"
      return 0
    else
      echo "Error: bun installation failed"
      return 1
    fi
  else
    echo "Error: bun is required to build OpenCode from source"
    return 1
  fi
}

# Build OpenCode from GitHub source
build_opencode_from_source() {
  local cmd="$1"
  local build_dir=$(mktemp -d)

  echo "Cloning OpenCode repository..."
  if ! git clone https://github.com/anomalyco/opencode.git "$build_dir" 2>&1; then
    echo "Error: Failed to clone OpenCode repository"
    rm -rf "$build_dir"
    return 1
  fi

  cd "$build_dir"

  echo "Installing OpenCode dependencies (this may take a few minutes)..."
  if ! bun install 2>&1; then
    echo "Error: bun install failed"
    rm -rf "$build_dir"
    return 1
  fi

  echo "Building OpenCode binaries..."
  cd packages/opencode
  if ! bun run build 2>&1; then
    echo "Error: OpenCode build failed"
    rm -rf "$build_dir"
    return 1
  fi

  echo "Building Docker image..."
  if ! $cmd build -t opencode:local . 2>&1; then
    echo "Error: Docker build failed"
    rm -rf "$build_dir"
    return 1
  fi

  cd /
  rm -rf "$build_dir"
  echo "OpenCode built successfully"
}

# Determine which OpenCode image to use
determine_opencode_image() {
  local cmd="$1"
  local opencode_image=""

  if check_ghcr_available "$cmd"; then
    opencode_image="ghcr.io/anomalyco/opencode:latest"
  else
    echo "Will build OpenCode locally from source"
    if check_local_opencode_image "$cmd"; then
      echo "Using cached local image"
      opencode_image="opencode:local"
    else
      if ! ensure_bun_installed; then
        echo "Error: Cannot proceed without bun"
        exit 1
      fi
      if ! build_opencode_from_source "$cmd"; then
        echo "Error: Failed to build OpenCode"
        exit 1
      fi
      opencode_image="opencode:local"
    fi
  fi

  echo "$opencode_image"
}

# Create directory structure
echo -e "${GREEN}Creating directory structure...${NC}"
mkdir -p "$BIN_DIR"
mkdir -p "$OPencode_CONFIG_DIR"
mkdir -p "$OPencode_STATE_DIR"
mkdir -p "$PACKAGES_DIR"
mkdir -p "$PROJECTS_DIR"
mkdir -p "$LOCAL_PACKAGES_DIR"

# Prompt for packages directory
echo ""
echo -e "${YELLOW}Where would you like to store your open-source packages?${NC}"
echo -e "  (Packages cloned from git repositories)"
read -p "  Default [$PACKAGES_DIR]: " USER_PACKAGES_DIR
USER_PACKAGES_DIR="${USER_PACKAGES_DIR:-$PACKAGES_DIR}"

# Expand tilde and resolve to absolute path
USER_PACKAGES_DIR="${USER_PACKAGES_DIR/#\~/$HOME}"
USER_PACKAGES_DIR=$(cd "$(dirname "$USER_PACKAGES_DIR")" && pwd)/$(basename "$USER_PACKAGES_DIR")

# Create user-specified packages directory if it doesn't exist
if [ ! -d "$USER_PACKAGES_DIR" ]; then
  echo -e "${GREEN}Creating packages directory: $USER_PACKAGES_DIR${NC}"
  mkdir -p "$USER_PACKAGES_DIR"
fi

# Prompt for projects directory
echo ""
echo -e "${YELLOW}Where would you like to store your projects?${NC}"
echo -e "  (Project configurations and local git repositories)"
read -p "  Default [$PROJECTS_DIR]: " USER_PROJECTS_DIR
USER_PROJECTS_DIR="${USER_PROJECTS_DIR:-$PROJECTS_DIR}"

# Expand tilde and resolve to absolute path
USER_PROJECTS_DIR="${USER_PROJECTS_DIR/#\~/$HOME}"
USER_PROJECTS_DIR=$(cd "$(dirname "$USER_PROJECTS_DIR")" && pwd)/$(basename "$USER_PROJECTS_DIR")

# Create user-specified projects directory if it doesn't exist
if [ ! -d "$USER_PROJECTS_DIR" ]; then
  echo -e "${GREEN}Creating projects directory: $USER_PROJECTS_DIR${NC}"
  mkdir -p "$USER_PROJECTS_DIR"
fi

# Determine local packages directory (default to same parent as packages)
LOCAL_PACKAGES_PARENT=$(dirname "$USER_PACKAGES_DIR")
USER_LOCAL_PACKAGES_DIR="$LOCAL_PACKAGES_PARENT/local-packages"

# Create local packages directory if it doesn't exist
if [ ! -d "$USER_LOCAL_PACKAGES_DIR" ]; then
  echo -e "${GREEN}Creating local packages directory: $USER_LOCAL_PACKAGES_DIR${NC}"
  mkdir -p "$USER_LOCAL_PACKAGES_DIR"
fi

# Determine container runtime and OpenCode image
echo ""
echo -e "${GREEN}Checking container runtime and OpenCode image...${NC}"
CONTAINER_CMD=$(detect_container_runtime)
if [ "$CONTAINER_CMD" = "none" ]; then
  echo -e "${RED}Error: Neither docker nor podman is installed.${NC}"
  echo "Please install docker or podman to use kinetic-context."
  exit 1
fi
echo "Using container runtime: $CONTAINER_CMD"

OPENCODE_IMAGE=$(determine_opencode_image "$CONTAINER_CMD")
echo "Using OpenCode image: $OPENCODE_IMAGE"

# Create compose.yaml
echo -e "${GREEN}Creating compose.yaml...${NC}"
cat > "$COMPOSE_FILE" <<EOF
version: '3.8'

services:
  opencode:
    image: $OPENCODE_IMAGE
    ports:
      - "7168:4096"
    volumes:
      - $OPencode_CONFIG_DIR:/config
      - $OPencode_STATE_DIR:/state
      - $USER_PACKAGES_DIR:/packages
      - $USER_PROJECTS_DIR:/projects
    command: ["serve", "--hostname=0.0.0.0"]
    environment:
      - OPENCODE_CONFIG=/config/opencode.json
      - XDG_STATE_HOME=/state
      - OPENCODE_DISABLE_DEFAULT_PLUGINS=true
    restart: unless-stopped

  kinetic-context:
    image: docker.io/christopherkapic/kinetic-context:latest
    ports:
      - "7167:3000"
    volumes:
      - $USER_PACKAGES_DIR:/packages
      - $USER_LOCAL_PACKAGES_DIR:/local-packages
      - $USER_PROJECTS_DIR:/projects
      - $OPencode_CONFIG_DIR:/config
    environment:
      - CORS_ORIGIN=http://localhost:7167
      - NODE_ENV=production
      - PACKAGES_DIR=/packages
      - LOCAL_PACKAGES_DIR=/local-packages
      - PROJECTS_DIR=/projects
      - OPENCODE_CONFIG_PATH=/config/opencode.json
      - OPENCODE_STATE_DIR=/state
      - OPENCODE_URL=http://opencode:4096
    depends_on:
      - opencode
    restart: unless-stopped
EOF

# Fetch kctx script from GitHub
echo -e "${GREEN}Fetching kctx script...${NC}"
mkdir -p "$BIN_DIR"

if ! curl -fsSL -o "$KCTX_SCRIPT" "$GITHUB_RAW_URL/kctx"; then
  echo -e "${RED}Error: Failed to fetch kctx script from GitHub${NC}"
  echo "Please check your internet connection and try again."
  exit 1
fi

chmod +x "$KCTX_SCRIPT"

# Print instructions
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Installation Complete!                                    ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [ "$OPENCODE_IMAGE" = "opencode:local" ]; then
  echo -e "${YELLOW}OpenCode was built locally from source${NC}"
  echo ""
  echo "This was done because ghcr.io authentication was not detected."
  echo "On subsequent installs, the local image will be reused."
  echo ""
fi

echo -e "${GREEN}Next Steps:${NC}"
echo ""
echo -e "1. ${BLUE}Add kctx to your PATH:${NC}"
echo ""
echo -e "   For bash (add to ~/.bashrc or ~/.bash_profile):"
echo -e "   ${BLUE}export PATH=\"\$HOME/.kctx/bin:\$PATH\"${NC}"
echo ""
echo -e "   For zsh (add to ~/.zshrc):"
echo -e "   ${BLUE}export PATH=\"\$HOME/.kctx/bin:\$PATH\"${NC}"
echo ""
echo -e "   Then reload your shell:"
echo -e "   ${BLUE}source ~/.bashrc${NC}  # or source ~/.zshrc"
echo ""

echo -e "2. ${BLUE}Configure API keys:${NC}"
echo -e "   Visit ${BLUE}http://localhost:7167/models${NC}"
echo ""

echo -e "3. ${BLUE}Start kinetic-context:${NC}"
echo -e "   ${BLUE}kctx start${NC}"
echo ""

echo -e "4. ${BLUE}Access the web UI:${NC}"
echo -e "   ${BLUE}http://localhost:7167${NC}"
echo ""

echo -e "5. ${BLUE}Use CLI to manage packages and providers:${NC}"
echo -e "   ${BLUE}kctx package add${NC}       - Add a new package"
echo -e "   ${BLUE}kctx package edit${NC}      - Edit an existing package"
echo -e "   ${BLUE}kctx package pull${NC}      - Pull latest changes for a package"
echo -e "   ${BLUE}kctx package pull-all${NC}   - Pull latest changes for all packages"
echo -e "   ${BLUE}kctx provider add${NC}      - Add a new provider"
echo -e "   ${BLUE}kctx provider edit${NC}     - Edit an existing provider"
echo ""

echo -e "${GREEN}Directory Configuration:${NC}"
echo -e "  Packages: ${BLUE}$USER_PACKAGES_DIR${NC}"
echo -e "  Local Packages: ${BLUE}$USER_LOCAL_PACKAGES_DIR${NC}"
echo -e "  Projects: ${BLUE}$USER_PROJECTS_DIR${NC}"
echo ""
