#!/bin/bash

set -e

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

# Stop and remove existing containers
echo "Stopping and removing existing containers..."
kctx down || true
$CONTAINER_CMD ps -a --filter 'name=kinetic-context' -q | xargs -I {} $CONTAINER_CMD rm -f {} 2>/dev/null || true

# Build the image
echo "Building kinetic-context image..."
$CONTAINER_CMD build -t christopherkapic/kinetic-context:latest .

# Start the services
echo "Starting services..."
kctx start
