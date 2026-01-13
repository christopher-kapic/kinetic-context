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
CONFIG_DIR="$KCTX_HOME/config"
DATA_DIR="$KCTX_HOME/data"
COMPOSE_FILE="$KCTX_HOME/compose.yaml"
KCTX_SCRIPT="$BIN_DIR/kctx"

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  kinetic-context Installation Script  ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# Create directory structure
echo -e "${GREEN}Creating directory structure...${NC}"
mkdir -p "$BIN_DIR"
mkdir -p "$CONFIG_DIR"
mkdir -p "$DATA_DIR/packages"
mkdir -p "$DATA_DIR/projects"

# Prompt for data directory
echo ""
echo -e "${YELLOW}Where would you like to store your data?${NC}"
echo -e "  (This includes packages and projects)"
read -p "  Default [$DATA_DIR]: " USER_DATA_DIR
USER_DATA_DIR="${USER_DATA_DIR:-$DATA_DIR}"

# Expand tilde and resolve to absolute path
USER_DATA_DIR="${USER_DATA_DIR/#\~/$HOME}"
USER_DATA_DIR=$(cd "$(dirname "$USER_DATA_DIR")" && pwd)/$(basename "$USER_DATA_DIR")

# Create user-specified data directory if it doesn't exist
if [ ! -d "$USER_DATA_DIR" ]; then
  echo -e "${GREEN}Creating data directory: $USER_DATA_DIR${NC}"
  mkdir -p "$USER_DATA_DIR/packages"
  mkdir -p "$USER_DATA_DIR/projects"
fi

# Create compose.yaml
echo -e "${GREEN}Creating compose.yaml...${NC}"
cat > "$COMPOSE_FILE" <<EOF
version: '3.8'

services:
  opencode:
    image: ghcr.io/anomalyco/opencode:latest
    ports:
      - "7168:4096"  # Map host port 7168 to container port 4096 (default opencode port)
    volumes:
      - $CONFIG_DIR:/config
      - $USER_DATA_DIR:/data
    command: ["serve", "--hostname=0.0.0.0"]
    environment:
      - OPENCODE_CONFIG=/config/opencode.json
      - XDG_STATE_HOME=/config/.local # separate .local/share/opencode from regular opencode instance
    restart: unless-stopped

  kinetic-context:
    image: christopherkapic/kinetic-context:latest
    ports:
      - "7167:3000"
    volumes:
      - $USER_DATA_DIR:/data
      - $CONFIG_DIR:/config
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
EOF

# Create kctx executable script
echo -e "${GREEN}Creating kctx executable...${NC}"
cat > "$KCTX_SCRIPT" <<'KCTX_EOF'
#!/bin/bash

set -e

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
    # Map aliases to service names
    case "$SERVICE" in
      kc)
        SERVICE="kinetic-context"
        ;;
      oc)
        SERVICE="opencode"
        ;;
    esac
    # If no service specified, show logs from both containers
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
  *)
    echo "Usage: kctx [start|stop|restart|status|logs|down]"
    echo ""
    echo "Commands:"
    echo "  start    - Start the services (default)"
    echo "  stop     - Stop the services"
    echo "  restart  - Restart the services"
    echo "  status   - Show service status"
    echo "  logs     - Show latest logs from both containers"
    echo "  logs kc  - Show latest logs from kinetic-context container"
    echo "  logs oc  - Show latest logs from opencode container"
    echo "  down     - Stop and remove containers"
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

echo -e "${YELLOW}⚠️  IMPORTANT: Authentication Required${NC}"
echo ""
echo -e "Before starting kinetic-context, you must authenticate to GitHub Container Registry"
echo -e "to pull the opencode image:"
echo ""
echo -e "  ${BLUE}docker login ghcr.io${NC}"
echo ""
echo -e "You will need a GitHub Personal Access Token (PAT) with ${BLUE}read:packages${NC} permission."
echo -e "Create one at: ${BLUE}https://github.com/settings/tokens${NC}"
echo ""

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

echo -e "2. ${BLUE}Configure API keys via the web UI:${NC}"
echo -e "   After starting kinetic-context, visit ${BLUE}http://localhost:7167/models${NC}"
echo -e "   to add providers and configure your API keys"
echo ""

echo -e "3. ${BLUE}Authenticate to ghcr.io:${NC}"
echo -e "   ${BLUE}docker login ghcr.io${NC}"
echo ""

echo -e "4. ${BLUE}Start kinetic-context:${NC}"
echo -e "   ${BLUE}kctx start${NC}"
echo -e "   (or: ${BLUE}kctx${NC} - start is the default)"
echo ""

echo -e "5. ${BLUE}Access the web UI:${NC}"
echo -e "   ${BLUE}http://localhost:7167${NC}"
echo ""

echo -e "${GREEN}Customization:${NC}"
echo ""
echo -e "  • Edit compose.yaml: ${BLUE}$COMPOSE_FILE${NC}"
echo -e "  • Change ports, volumes, or environment variables as needed"
echo ""

echo -e "${GREEN}Useful Commands:${NC}"
echo ""
echo -e "  ${BLUE}kctx start${NC}    - Start the services"
echo -e "  ${BLUE}kctx stop${NC}     - Stop the services"
echo -e "  ${BLUE}kctx status${NC}   - Show service status"
echo -e "  ${BLUE}kctx logs${NC}     - Show logs"
echo -e "  ${BLUE}kctx down${NC}     - Stop and remove containers"
echo ""

echo -e "${GREEN}Data Directory:${NC} ${BLUE}$USER_DATA_DIR${NC}"
echo ""
