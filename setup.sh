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
  echo "Checking ghcr.io access..."
  if $cmd pull ghcr.io/anomalyco/opencode:latest 2>&1 | grep -qiE "denied|unauthorized|not found|authentication"; then
    echo "ghcr.io access not available (authentication required or image not found)"
    return 1
  fi
  echo "ghcr.io access available"
  return 0
}

# Check if local OpenCode image exists
check_local_opencode_image() {
  local cmd="$1"
  if $cmd image inspect opencode:local >/dev/null 2>&1; then
    echo "Local OpenCode image found"
    return 0
  fi
  echo "Local OpenCode image not found"
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
    image: christopherkapic/kinetic-context:latest
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

# Create kctx executable script
echo -e "${GREEN}Creating kctx executable...${NC}"
cat > "$KCTX_SCRIPT" <<'KCTX_EOF'
#!/bin/bash

set -e

API_BASE="http://localhost:7167"
COMPOSE_FILE="$HOME/.kctx/compose.yaml"

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "Error: compose.yaml not found at $COMPOSE_FILE"
  echo "Please run the setup script again."
  exit 1
fi

# Detect container runtime (docker or podman)
if command -v docker >/dev/null 2>&1; then
  CONTAINER_CMD="docker"
elif command -v podman >/dev/null 2>&1; then
  CONTAINER_CMD="podman"
else
  echo "Error: Neither docker nor podman is installed."
  echo "Please install docker or podman to use kinetic-context."
  exit 1
fi

# API call helper
api_call() {
  local method="$1"
  local endpoint="$2"
  local data="$3"

  if [ -n "$data" ]; then
    curl -s -X "$method" "$API_BASE$endpoint" \
      -H "Content-Type: application/json" \
      -d "$data"
  else
    curl -s -X "$method" "$API_BASE$endpoint" \
      -H "Content-Type: application/json"
  fi
}

# Check if API is available
check_api() {
  if ! curl -s "$API_BASE" >/dev/null 2>&1; then
    echo "Error: kinetic-context API is not running at $API_BASE"
    echo "Start it with: kctx start"
    exit 1
  fi
}

# Prompt for input with default value
prompt_with_default() {
  local prompt="$1"
  local default="$2"
  local var_name="$3"

  if [ -n "$default" ]; then
    read -p "$prompt [$default]: " "$var_name"
    if [ -z "${!var_name}" ]; then
      eval "$var_name=\"$default\""
    fi
  else
    read -p "$prompt: " "$var_name"
  fi
}

# Prompt for password (hidden input)
prompt_password() {
  local prompt="$1"
  local var_name="$2"
  read -s -p "$prompt: " "$var_name"
  echo
}

# Package add command
package_add() {
  check_api

  echo ""
  echo "Add New Package"
  echo "==============="
  echo ""

  echo "Package Types:"
  echo "  1. Cloned - Clone from git repository"
  echo "  2. Local - Use existing local repository"
  echo ""
  read -p "Select type [1]: " storage_type_num
  storage_type_num="${storage_type_num:-1}"

  case "$storage_type_num" in
    1) storage_type="cloned" ;;
    2) storage_type="local" ;;
    *)
      echo "Invalid selection"
      exit 1
      ;;
  esac

  prompt_with_default "Package Identifier (e.g., @hookform/resolvers)" "" identifier
  prompt_with_default "Package Manager (npm/pnpm/yarn)" "npm" package_manager
  prompt_with_default "Display Name" "$identifier" display_name

  if [ "$storage_type" = "cloned" ]; then
    prompt_with_default "Git URL" "" git_url
    prompt_with_default "Default Tag/Branch (e.g., master, main, or 'auto' to detect)" "auto" default_tag
    repo_path=""
  else
    prompt_with_default "Repository Path (absolute path)" "" repo_path
    git_url=""
    default_tag=""
  fi

  echo ""
  echo "Optional URLs (press Enter to skip)"
  prompt_with_default "  Website URL" "" website_url
  prompt_with_default "  Documentation URL" "" docs_url
  prompt_with_default "  Git Browser URL" "" git_browser_url
  prompt_with_default "  Logo URL" "" logo_url

  echo ""
  echo "Summary:"
  echo "  Identifier: $identifier"
  echo "  Display Name: $display_name"
  echo "  Package Manager: $package_manager"
  echo "  Storage Type: $storage_type"
  [ "$storage_type" = "cloned" ] && echo "  Git URL: $git_url" && echo "  Default Tag: $default_tag"
  [ "$storage_type" = "local" ] && echo "  Repository Path: $repo_path"
  [ -n "$website_url" ] && echo "  Website: $website_url"
  [ -n "$docs_url" ] && echo "  Docs: $docs_url"
  [ -n "$git_browser_url" ] && echo "  Git Browser: $git_browser_url"
  [ -n "$logo_url" ] && echo "  Logo: $logo_url"
  echo ""

  read -p "Create this package? (Y/n): " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]?$ ]] && [[ -n $REPLY ]]; then
    echo "Cancelled"
    exit 0
  fi

  # Build JSON payload
  local data=$(cat <<EOF
{
  "identifier": "$identifier",
  "package_manager": "$package_manager",
  "display_name": "$display_name",
  "storage_type": "$storage_type",
  "repo_path": "$repo_path",
  "default_tag": "$default_tag",
  "urls": {
    "website": "$website_url",
    "docs": "$docs_url",
    "git_browser": "$git_browser_url",
    "git": "$git_url",
    "logo": "$logo_url"
  }
}
EOF
)

  echo "Creating package..."
  local result=$(api_call "POST" "/packages" "$data")
  echo "$result" | head -50
}

# Package edit command
package_edit() {
  check_api

  echo ""
  echo "Edit Package"
  echo "============"
  echo ""

  # Fetch all packages
  local packages=$(api_call "GET" "/packages")
  if [ -z "$packages" ] || [ "$packages" = "[]" ]; then
    echo "No packages found"
    exit 0
  fi

  echo "Select a package to edit:"
  echo ""

  # Parse and display packages
  local count=1
  local ids=""
  while IFS= read -r line; do
    local id=$(echo "$line" | grep -o '"identifier":"[^"]*"' | head -1 | sed 's/"identifier":"//;s/"//g')
    local name=$(echo "$line" | grep -o '"display_name":"[^"]*"' | head -1 | sed 's/"display_name":"//;s/"//g')
    if [ -n "$id" ]; then
      echo "  $count. $id ($name)"
      ids="$ids $id"
      count=$((count + 1))
    fi
  done <<< "$packages"

  echo ""
  read -p "Enter number: " selection
  if [ -z "$selection" ] || [ "$selection" -lt 1 ] || [ "$selection" -ge "$count" ]; then
    echo "Invalid selection"
    exit 1
  fi

  local selected_id=$(echo "$ids" | cut -d' ' -f$selection)
  echo "Selected: $selected_id"
  echo ""

  # Fetch package details
  local pkg_json=$(api_call "GET" "/packages/$selected_id")

  # Extract current values
  local current_identifier=$(echo "$pkg_json" | grep -o '"identifier":"[^"]*"' | head -1 | sed 's/"identifier":"//;s/"//g')
  local current_display_name=$(echo "$pkg_json" | grep -o '"display_name":"[^"]*"' | head -1 | sed 's/"display_name":"//;s/"//g')
  local current_package_manager=$(echo "$pkg_json" | grep -o '"package_manager":"[^"]*"' | head -1 | sed 's/"package_manager":"//;s/"//g')
  local current_storage_type=$(echo "$pkg_json" | grep -o '"storage_type":"[^"]*"' | head -1 | sed 's/"storage_type":"//;s/"//g')
  local current_default_tag=$(echo "$pkg_json" | grep -o '"default_tag":"[^"]*"' | head -1 | sed 's/"default_tag":"//;s/"//g')
  local current_git=$(echo "$pkg_json" | grep -o '"git":"[^"]*"' | head -1 | sed 's/"git":"//;s/"//g')
  local current_repo_path=$(echo "$pkg_json" | grep -o '"repo_path":"[^"]*"' | head -1 | sed 's/"repo_path":"//;s/"//g')
  local current_website=$(echo "$pkg_json" | grep -o '"website":"[^"]*"' | head -1 | sed 's/"website":"//;s/"//g')
  local current_docs=$(echo "$pkg_json" | grep -o '"docs":"[^"]*"' | head -1 | sed 's/"docs":"//;s/"//g')
  local current_git_browser=$(echo "$pkg_json" | grep -o '"git_browser":"[^"]*"' | head -1 | sed 's/"git_browser":"//;s/"//g')
  local current_logo=$(echo "$pkg_json" | grep -o '"logo":"[^"]*"' | head -1 | sed 's/"logo":"//;s/"//g')

  echo "Edit Package Details (press Enter to keep current value)"
  echo ""

  prompt_with_default "Identifier" "$current_identifier" new_identifier
  prompt_with_default "Display Name" "$current_display_name" new_display_name
  prompt_with_default "Package Manager" "$current_package_manager" new_package_manager

  echo ""
  echo "Storage Type: $current_storage_type"
  echo "  1. Keep current"
  echo "  2. Change to cloned"
  echo "  3. Change to local"
  read -p "Selection [1]: " storage_selection
  storage_selection="${storage_selection:-1}"
  case "$storage_selection" in
    1) new_storage_type="$current_storage_type" ;;
    2) new_storage_type="cloned" ;;
    3) new_storage_type="local" ;;
    *) new_storage_type="$current_storage_type" ;;
  esac

  if [ "$new_storage_type" = "cloned" ]; then
    prompt_with_default "Git URL" "$current_git" new_git
    prompt_with_default "Default Tag/Branch" "$current_default_tag" new_default_tag
    new_repo_path=""
  else
    prompt_with_default "Repository Path" "$current_repo_path" new_repo_path
    new_git=""
    new_default_tag=""
  fi

  echo ""
  echo "Optional URLs (press Enter to keep current)"
  prompt_with_default "  Website URL" "$current_website" new_website
  prompt_with_default "  Documentation URL" "$current_docs" new_docs
  prompt_with_default "  Git Browser URL" "$current_git_browser" new_git_browser
  prompt_with_default "  Logo URL" "$current_logo" new_logo

  echo ""
  echo "Summary of changes:"
  [ "$new_identifier" != "$current_identifier" ] && echo "  Identifier: $current_identifier -> $new_identifier"
  echo "  Display Name: $new_display_name"
  echo "  Package Manager: $new_package_manager"
  echo "  Storage Type: $new_storage_type"
  [ "$new_storage_type" = "cloned" ] && [ "$new_git" != "$current_git" ] && [ -n "$new_git" ] && echo "  Git URL: $new_git"
  [ "$new_storage_type" = "cloned" ] && [ "$new_default_tag" != "$current_default_tag" ] && [ -n "$new_default_tag" ] && echo "  Default Tag: $new_default_tag"
  [ "$new_storage_type" = "local" ] && [ "$new_repo_path" != "$current_repo_path" ] && [ -n "$new_repo_path" ] && echo "  Repo Path: $new_repo_path"
  echo ""

  read -p "Save changes? (Y/n): " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]?$ ]] && [[ -n $REPLY ]]; then
    echo "Cancelled"
    exit 0
  fi

  # Build JSON payload - only include changed fields
  local updates="{}"
  [ "$new_identifier" != "$current_identifier" ] && updates=$(echo "$updates" | sed "s/}/,\"identifier\":\"$new_identifier\"/1")
  [ "$new_display_name" != "$current_display_name" ] && updates=$(echo "$updates" | sed "s/}/,\"display_name\":\"$new_display_name\"/1")
  [ "$new_package_manager" != "$current_package_manager" ] && updates=$(echo "$updates" | sed "s/}/,\"package_manager\":\"$new_package_manager\"/1")
  [ "$new_storage_type" != "$current_storage_type" ] && updates=$(echo "$updates" | sed "s/}/,\"storage_type\":\"$new_storage_type\"/1")
  [ -n "$new_repo_path" ] && updates=$(echo "$updates" | sed "s/}/,\"repo_path\":\"$new_repo_path\"/1")
  [ -n "$new_default_tag" ] && updates=$(echo "$updates" | sed "s/}/,\"default_tag\":\"$new_default_tag\"/1")

  local url_updates="{}"
  [ -n "$new_git" ] && url_updates=$(echo "$url_updates" | sed "s/}/,\"git\":\"$new_git\"/1")
  [ -n "$new_website" ] && url_updates=$(echo "$url_updates" | sed "s/}/,\"website\":\"$new_website\"/1")
  [ -n "$new_docs" ] && url_updates=$(echo "$url_updates" | sed "s/}/,\"docs\":\"$new_docs\"/1")
  [ -n "$new_git_browser" ] && url_updates=$(echo "$url_updates" | sed "s/}/,\"git_browser\":\"$new_git_browser\"/1")
  [ -n "$new_logo" ] && url_updates=$(echo "$url_updates" | sed "s/}/,\"logo\":\"$new_logo\"/1")

  if [ "$url_updates" != "{}" ]; then
    updates=$(echo "$updates" | sed "s/}/,\"urls\":$url_updates/1")
  fi

  echo "Updating package..."
  local result=$(api_call "PATCH" "/packages/$current_identifier" "$updates")
  echo "$result" | head -50
}

# Package pull command (single package)
package_pull() {
  check_api

  local target_identifier="${2:-}"

  # If no identifier provided, show list
  if [ -z "$target_identifier" ]; then
    echo ""
    echo "Pull Package"
    echo "============"
    echo ""

    # Fetch all packages
    local packages=$(api_call "GET" "/packages")
    if [ -z "$packages" ] || [ "$packages" = "[]" ]; then
      echo "No packages found"
      exit 0
    fi

    echo "Select a package to pull:"
    echo ""

    # Parse and display only cloned packages (they have git repos)
    local count=1
    local ids=""
    while IFS= read -r line; do
      local id=$(echo "$line" | grep -o '"identifier":"[^"]*"' | head -1 | sed 's/"identifier":"//;s/"//g')
      local name=$(echo "$line" | grep -o '"display_name":"[^"]*"' | head -1 | sed 's/"display_name":"//;s/"//g')
      local storage_type=$(echo "$line" | grep -o '"storage_type":"[^"]*"' | head -1 | sed 's/"storage_type":"//;s/"//g')
      if [ -n "$id" ] && [ "$storage_type" = "cloned" ]; then
        echo "  $count. $id ($name)"
        ids="$ids $id"
        count=$((count + 1))
      fi
    done <<< "$packages"

    if [ "$count" -eq 1 ]; then
      echo "No cloned packages found. Only cloned packages can be pulled."
      exit 0
    fi

    echo ""
    read -p "Enter number: " selection
    if [ -z "$selection" ] || [ "$selection" -lt 1 ] || [ "$selection" -ge "$count" ]; then
      echo "Invalid selection"
      exit 1
    fi

    target_identifier=$(echo "$ids" | cut -d' ' -f$selection)
  fi

  echo ""
  echo "Pulling package: $target_identifier"
  echo ""

  # Fetch package details to get repo path
  local pkg_json=$(api_call "GET" "/packages/$target_identifier")
  local storage_type=$(echo "$pkg_json" | grep -o '"storage_type":"[^"]*"' | head -1 | sed 's/"storage_type":"//;s/"//g')
  local repo_path=$(echo "$pkg_json" | grep -o '"repo_path":"[^"]*"' | head -1 | sed 's/"repo_path":"//;s/"//g')

  if [ "$storage_type" != "cloned" ]; then
    echo "Error: Only cloned packages can be pulled. '$target_identifier' is a local package."
    exit 1
  fi

  if [ -z "$repo_path" ] || [ ! -d "$repo_path" ]; then
    echo "Error: Repository path not found or not accessible: $repo_path"
    exit 1
  fi

  # Check if it's a git repository
  if [ ! -d "$repo_path/.git" ]; then
    echo "Error: Not a git repository: $repo_path"
    exit 1
  fi

  # Pull the latest changes
  echo "Pulling from remote..."
  if git -C "$repo_path" pull origin 2>&1; then
    echo "Successfully pulled updates for $target_identifier"
  else
    echo "Error: Failed to pull updates for $target_identifier"
    exit 1
  fi
}

# Package pull-all command
package_pull_all() {
  check_api

  echo ""
  echo "Pull All Packages"
  echo "================="
  echo ""

  # Fetch all packages
  local packages=$(api_call "GET" "/packages")
  if [ -z "$packages" ] || [ "$packages" = "[]" ]; then
    echo "No packages found"
    exit 0
  fi

  echo "Fetching update results from server..."
  local results=$(api_call "POST" "/packages/updateAll" "{}")
  echo "$results"
}

# Provider add command
provider_add() {
  check_api

  echo ""
  echo "Add Provider"
  echo "============"
  echo ""

  echo "Provider Types:"
  echo "  1. OpenRouter"
  echo "  2. OpenCode Zen"
  echo "  3. Custom (OpenAI-compatible)"
  echo ""
  read -p "Select provider type: " provider_type
  echo ""

  case "$provider_type" in
    1)
      provider_id="openrouter"
      provider_npm="@openrouter/ai-sdk-provider"
      provider_name="OpenRouter"
      default_base_url="https://openrouter.ai/api/v1"
      default_model="anthropic/claude-3.5-sonnet"
      ;;
    2)
      provider_id="opencode"
      provider_npm="@ai-sdk/openai-compatible"
      provider_name="OpenCode Zen"
      default_base_url="https://opencode.ai/zen/v1"
      default_model="gpt-5.2-codex"
      ;;
    3)
      provider_id=""
      provider_npm=""
      echo "Enter provider details:"
      read -p "Provider ID (e.g., my-provider): " provider_id
      read -p "NPM package (e.g., @ai-sdk/openai-compatible): " provider_npm
      echo ""
      prompt_with_default "Base URL" "" base_url
      prompt_with_default "Default Model" "" default_model
      provider_name="$provider_id"
      ;;
    *)
      echo "Invalid selection"
      exit 1
      ;;
  esac

  if [ "$provider_type" != "3" ]; then
    prompt_password "API Key" api_key
    prompt_with_default "Base URL" "$default_base_url" base_url
    prompt_with_default "Default Model" "$default_model" default_model
  fi

  echo ""
  echo "Models (one per line, empty line to finish):"
  local models_json="{}"
  local model_count=0
  while IFS= read -r line; do
    if [ -z "$line" ]; then
      break
    fi
    model_count=$((model_count + 1))
    local model_id=$(echo "$line" | xargs)
    local model_name="$model_id"
    models_json=$(echo "$models_json" | sed "s/}/\"$model_id\":{\"name\":\"$model_name\"}/1")
  done

  echo ""
  echo "Summary:"
  echo "  Provider ID: $provider_id"
  echo "  NPM Package: $provider_npm"
  echo "  Base URL: $base_url"
  echo "  Default Model: $default_model"
  echo "  Models: $model_count configured"
  echo ""

  read -p "Add this provider? (Y/n): " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]?$ ]] && [[ -n $REPLY ]]; then
    echo "Cancelled"
    exit 0
  fi

  # Get current config and add provider
  local current_config=$(api_call "GET" "/config/opencode")

  # Build provider JSON
  local provider_json=$(cat <<EOF
{"$provider_id":{"npm":"$provider_npm","name":"$provider_name","options":{"baseURL":"$base_url","apiKey":"$api_key"},"models":$models_json}}
EOF
)

  # Merge provider into current config
  local new_config=$(echo "$current_config" | sed 's/"provider":{}/"provider":{'"$provider_id"'/' | sed 's/}$/,'$provider_json'}/')

  # Update model default if set
  if [ -n "$default_model" ]; then
    new_config=$(echo "$new_config" | sed "s/\"model\":\"[^\"]*\"/\"model\":\"$provider_id\/$default_model\"/1")
  fi

  echo "Saving provider..."
  local result=$(api_call "PATCH" "/config/opencode" "\"$new_config\"")
  echo "$result" | head -50
}

# Provider edit command
provider_edit() {
  check_api

  echo ""
  echo "Edit Provider"
  echo "============="
  echo ""

  # Get current config
  local config=$(api_call "GET" "/config/opencode")

  # Extract provider IDs
  local providers=$(echo "$config" | grep -o '"[a-zA-Z0-9-]*":{' | sed 's/":{//;s/"//g' | grep -v "provider\|agent" | head -10)

  if [ -z "$providers" ]; then
    echo "No providers found"
    exit 0
  fi

  echo "Select a provider to edit:"
  echo ""
  local count=1
  local provider_ids=""
  for p in $providers; do
    echo "  $count. $p"
    provider_ids="$provider_ids $p"
    count=$((count + 1))
  done

  echo ""
  read -p "Enter number: " selection
  if [ -z "$selection" ] || [ "$selection" -lt 1 ] || [ "$selection" -ge "$count" ]; then
    echo "Invalid selection"
    exit 1
  fi

  local provider_id=$(echo "$provider_ids" | cut -d' ' -f$selection)
  echo "Selected: $provider_id"
  echo ""

  # Extract current provider details
  local current_npm=$(echo "$config" | grep -A20 "\"$provider_id\":" | grep -o '"npm":"[^"]*"' | head -1 | sed 's/"npm":"//;s/"//g')
  local current_name=$(echo "$config" | grep -A20 "\"$provider_id\":" | grep -o '"name":"[^"]*"' | head -1 | sed 's/"name":"//;s/"//g')
  local current_base_url=$(echo "$config" | grep -A20 "\"$provider_id\":" | grep -o '"baseURL":"[^"]*"' | head -1 | sed 's/"baseURL":"//;s/"//g')

  echo "Edit Provider Details (press Enter to keep current value)"
  echo ""

  prompt_with_default "NPM Package" "$current_npm" new_npm
  prompt_with_default "Display Name" "$current_name" new_name
  prompt_with_default "Base URL" "$current_base_url" new_base_url

  echo ""
  echo "API Key: [hidden]"
  read -p "  New API key (leave empty to keep current, enter '-' to clear): " new_api_key
  if [ "$new_api_key" = "-" ]; then
    new_api_key=""
  elif [ -z "$new_api_key" ]; then
    new_api_key="<UNCHANGED>"
  fi

  echo ""
  echo "Models: (not editable via CLI yet)"
  echo ""

  read -p "Save changes? (Y/n): " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]?$ ]] && [[ -n $REPLY ]]; then
    echo "Cancelled"
    exit 0
  fi

  echo "Provider updates must be done via the web UI for complex changes."
  echo "Current provider ID: $provider_id"
  echo "NPM: $new_npm"
  echo "Name: $new_name"
  echo "Base URL: $new_base_url"
}

# Dispatch commands
case "${1:-start}" in
  start)
    echo "Starting kinetic-context..."
    $CONTAINER_CMD compose -f "$COMPOSE_FILE" up -d
    echo "kinetic-context is running!"
    echo "  Web UI: http://localhost:7167"
    echo "  OpenCode: http://localhost:7168"
    ;;
  stop)
    echo "Stopping kinetic-context..."
    $CONTAINER_CMD compose -f "$COMPOSE_FILE" stop
    ;;
  restart)
    echo "Restarting kinetic-context..."
    $CONTAINER_CMD compose -f "$COMPOSE_FILE" restart
    ;;
  status)
    $CONTAINER_CMD compose -f "$COMPOSE_FILE" ps
    ;;
  logs)
    SERVICE="${2:-}"
    case "$SERVICE" in
      kc)
        SERVICE="kinetic-context"
        ;;
      oc)
        SERVICE="opencode"
        ;;
    esac
    if [ -z "$SERVICE" ]; then
      $CONTAINER_CMD compose -f "$COMPOSE_FILE" logs
    else
      $CONTAINER_CMD compose -f "$COMPOSE_FILE" logs "$SERVICE"
    fi
    ;;
  down)
    echo "Stopping and removing containers..."
    $CONTAINER_CMD compose -f "$COMPOSE_FILE" down
    ;;
  update)
    echo "Updating kinetic-context..."
    echo "Pulling latest images..."
    $CONTAINER_CMD pull christopherkapic/kinetic-context:latest
    if $CONTAINER_CMD image inspect opencode:local >/dev/null 2>&1; then
      echo "Using local OpenCode image (rebuild skipped)"
    else
      $CONTAINER_CMD pull ghcr.io/anomalyco/opencode:latest || true
    fi
    echo "Restarting services with new images..."
    $CONTAINER_CMD compose -f "$COMPOSE_FILE" up -d --force-recreate
    echo "Update complete!"
    ;;
  package)
    case "${2:-}" in
      add)
        package_add
        ;;
      edit)
        package_edit
        ;;
      pull)
        package_pull "$@"
        ;;
      pull-all)
        package_pull_all
        ;;
      *)
        echo "Usage: kctx package [add|edit|pull|pull-all]"
        echo "  add      - Add a new package"
        echo "  edit     - Edit an existing package"
        echo "  pull     - Pull latest changes for a package"
        echo "  pull-all - Pull latest changes for all packages"
        exit 1
        ;;
    esac
    ;;
  provider)
    case "${2:-}" in
      add)
        provider_add
        ;;
      edit)
        provider_edit
        ;;
      *)
        echo "Usage: kctx provider [add|edit]"
        exit 1
        ;;
    esac
    ;;
  *)
    echo "Usage: kctx [start|stop|restart|status|logs|down|update|package|provider]"
    echo ""
    echo "Commands:"
    echo "  start        - Start the services (default)"
    echo "  stop         - Stop the services"
    echo "  restart      - Restart the services"
    echo "  status       - Show service status"
    echo "  logs         - Show latest logs from both containers"
    echo "  logs kc      - Show latest logs from kinetic-context container"
    echo "  logs oc      - Show latest logs from opencode container"
    echo "  down         - Stop and remove containers"
    echo "  update       - Pull latest images and restart services"
    echo "  package      - Manage packages"
    echo "    add        - Add a new package"
    echo "    edit       - Edit an existing package"
    echo "    pull       - Pull latest changes for a package"
    echo "    pull-all   - Pull latest changes for all packages"
    echo "  provider     - Manage providers"
    echo "    add        - Add a new provider"
    echo "    edit       - Edit an existing provider"
    exit 1
    ;;
esac
KCTX_EOF

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
