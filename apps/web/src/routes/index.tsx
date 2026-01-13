import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { orpc } from "@/utils/orpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

/**
 * Generates a Cursor deeplink URL for installing the MCP server
 */
function generateCursorDeeplink(): string {
  const mcpUrl = `${window.location.origin}/mcp`;
  // The config should be just the server properties, not wrapped in a key
  // Cursor uses the 'name' parameter as the key in mcpServers
  const config = {
    url: mcpUrl,
  };
  const configJson = JSON.stringify(config);
  const base64Config = btoa(configJson);
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=kinetic-context&config=${base64Config}`;
}

/**
 * Handles the click event for the "Add to Cursor" button
 */
function handleAddToCursor() {
  const deeplink = generateCursorDeeplink();
  window.location.href = deeplink;
}

function HomeComponent() {
  const stats = useQuery(orpc.stats.get.queryOptions());
  const mcpUrl = typeof window !== "undefined" ? `${window.location.origin}/mcp` : "";

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold">Dashboard</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">
          Overview of your projects and packages
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Projects</CardTitle>
            <CardDescription>Total number of configured projects</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-3xl sm:text-4xl font-bold">
                {stats.data?.projects ?? 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Packages</CardTitle>
            <CardDescription>Total number of configured packages</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-3xl sm:text-4xl font-bold">
                {stats.data?.packages ?? 0}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add to Cursor Button */}
      <Card className="mb-6 sm:mb-8">
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Install MCP Server</CardTitle>
          <CardDescription>Add kinetic-context MCP server to your AI coding tools</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleAddToCursor} size="lg" className="w-full sm:w-auto">
            Add to Cursor
          </Button>
          <p className="text-sm text-muted-foreground mt-3">
            Click the button above to install the MCP server in Cursor. You can also install manually
            using the instructions below.
          </p>
        </CardContent>
      </Card>

      {/* Documentation Sections */}
      <div className="space-y-6 sm:space-y-8">
        {/* Cursor Manual Installation */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Cursor Manual Installation</CardTitle>
            <CardDescription>
              Install the MCP server manually in Cursor by editing your configuration file
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm mb-3">
                Go to: <strong>Settings → Cursor Settings → MCP → Add new global MCP server</strong>
              </p>
              <p className="text-sm mb-3">
                Pasting the following configuration into your Cursor <code className="text-xs bg-muted px-1 py-0.5 rounded">~/.cursor/mcp.json</code> file is the recommended approach. You may also install in a specific project by creating <code className="text-xs bg-muted px-1 py-0.5 rounded">.cursor/mcp.json</code> in your project folder. See{" "}
                <a
                  href="https://docs.cursor.com/mcp"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Cursor MCP docs
                </a>{" "}
                for more info.
              </p>
              <p className="text-sm mb-3">
                Since Cursor 1.0, you can click the install button above for instant one-click installation.
              </p>
            </div>
            <div>
              <p className="text-sm font-medium mb-2">Cursor Remote Server Connection</p>
              <pre className="text-xs bg-muted p-4 rounded overflow-x-auto">
                <code>{`{
  "mcpServers": {
    "kinetic-context": {
      "url": "${mcpUrl}"
    }
  }
}`}</code>
              </pre>
            </div>
          </CardContent>
        </Card>

        {/* Opencode Installation */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Opencode Installation</CardTitle>
            <CardDescription>
              Add the MCP server to your Opencode configuration file
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm mb-3">
                Add this to your Opencode configuration file. See{" "}
                <a
                  href="https://opencode.ai/docs/mcp-servers"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Opencode MCP docs
                </a>{" "}
                for more info.
              </p>
            </div>
            <div>
              <p className="text-sm font-medium mb-2">Opencode Remote Server Connection</p>
              <pre className="text-xs bg-muted p-4 rounded overflow-x-auto">
                <code>{`"mcp": {
  "kinetic-context": {
    "type": "remote",
    "url": "${mcpUrl}",
    "enabled": true
  }
}`}</code>
              </pre>
            </div>
          </CardContent>
        </Card>

        {/* VS Code Installation */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">VS Code Installation</CardTitle>
            <CardDescription>
              Configure the MCP server in VS Code for all your workspaces
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm mb-3">
                To configure an MCP server for all your workspaces, you can add the server configuration to your user profile. This enables you to reuse the same server configuration across multiple projects.
              </p>
              <p className="text-sm font-medium mb-2">To add an MCP server to your user configuration:</p>
              <ol className="text-sm list-decimal list-inside space-y-2 mb-3">
                <li>
                  Run the <strong>MCP: Add Server</strong> command from the Command Palette, provide the server information, and then select <strong>Global</strong> to add the server configuration to your profile.
                </li>
                <li>
                  Alternatively, run the <strong>MCP: Open User Configuration</strong> command, which opens the <code className="text-xs bg-muted px-1 py-0.5 rounded">mcp.json</code> file in your user profile. You can then manually add the server configuration to the file.
                </li>
              </ol>
              <p className="text-sm mb-3">
                When you use multiple VS Code profiles, this allows you to switch between different MCP server configurations based on your active profile. For example, the kinetic-context MCP server could be configured in a web development profile, but not in a Python development profile.
              </p>
              <p className="text-sm mb-3">
                MCP servers are executed wherever they're configured. If you're connected to a remote and want a server to run on the remote machine, it should be defined in your remote settings (<strong>MCP: Open Remote User Configuration</strong>) or in the workspace's settings. MCP servers defined in your user settings are always executed locally.
              </p>
            </div>
            <div>
              <p className="text-sm font-medium mb-2">Manual Configuration</p>
              <p className="text-sm mb-2">
                Add the following to your VS Code user <code className="text-xs bg-muted px-1 py-0.5 rounded">mcp.json</code> file:
              </p>
              <pre className="text-xs bg-muted p-4 rounded overflow-x-auto">
                <code>{`{
  "mcpServers": {
    "kinetic-context": {
      "url": "${mcpUrl}"
    }
  }
}`}</code>
              </pre>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
