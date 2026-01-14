import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";

import { orpc } from "@/utils/orpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Loader2, MessageSquare } from "lucide-react";

export const Route = createFileRoute("/package/$identifier")({
  component: PackageDetailComponent,
});

function PackageDetailComponent() {
  const { identifier } = Route.useParams();
  const router = useRouterState();
  const isChatRoute = router.location.pathname.includes("/chat");
  const pkg = useQuery(orpc.packages.get.queryOptions({ input: { identifier } }));

  if (pkg.isLoading) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-6 sm:py-8">
        <Skeleton className="h-8 w-48 mb-4" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!pkg.data) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-6 sm:py-8">
        <p>Package not found</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6 sm:py-8">
      {isChatRoute ? (
        <Outlet />
      ) : (
        <>
          <div className="mb-6 sm:mb-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
                  {pkg.data.urls?.logo && (
                    <img
                      src={pkg.data.urls.logo}
                      alt={`${pkg.data.display_name} logo`}
                      className="size-8 object-contain"
                    />
                  )}
                  {pkg.data.display_name}
                  {pkg.data.cloneStatus === "cloning" && (
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  )}
                </h1>
                <p className="text-sm sm:text-base text-muted-foreground mt-1">
                  {pkg.data.identifier}
                </p>
              </div>
              <Link
                to="/package/$identifier/chat"
                params={{ identifier: pkg.data.identifier }}
              >
                <Button>
                  <MessageSquare className="size-4 mr-2" />
                  Chat
                </Button>
              </Link>
            </div>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Package Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="text-sm font-medium mb-1">Storage Type</div>
                  <div>
                    <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-primary/10 text-primary">
                      {pkg.data.storage_type === "cloned" ? "Cloned Repository" : "Existing Repository"}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium mb-1">Repository Path</div>
                  <div className="text-sm text-muted-foreground font-mono break-all">{pkg.data.repo_path}</div>
                </div>
                <div>
                  <div className="text-sm font-medium mb-1">Package Manager</div>
                  <div className="text-sm text-muted-foreground">{pkg.data.package_manager || "N/A"}</div>
                </div>
                {pkg.data.storage_type === "cloned" && (
                  <div>
                    <div className="text-sm font-medium mb-1">Default Tag</div>
                    <div className="text-sm text-muted-foreground">{pkg.data.default_tag || "N/A"}</div>
                  </div>
                )}
                {pkg.data.cloneStatus && pkg.data.cloneStatus !== "completed" && (
                  <div>
                    <div className="text-sm font-medium mb-1">Clone Status</div>
                    <div className="text-sm text-muted-foreground">
                      {pkg.data.cloneStatus}
                      {pkg.data.cloneStatus === "cloning" && " (this may take a while...)"}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {(pkg.data.urls.website ||
              pkg.data.urls.docs ||
              pkg.data.urls.git_browser ||
              pkg.data.urls.git) && (
              <Card>
                <CardHeader>
                  <CardTitle>URLs</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {pkg.data.urls.website && (
                    <div>
                      <div className="text-sm font-medium mb-1">Website</div>
                      <a
                        href={pkg.data.urls.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline"
                      >
                        {pkg.data.urls.website}
                      </a>
                    </div>
                  )}
                  {pkg.data.urls.docs && (
                    <div>
                      <div className="text-sm font-medium mb-1">Documentation</div>
                      <a
                        href={pkg.data.urls.docs}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline"
                      >
                        {pkg.data.urls.docs}
                      </a>
                    </div>
                  )}
                  {pkg.data.urls.git_browser && (
                    <div>
                      <div className="text-sm font-medium mb-1">Git Browser</div>
                      <a
                        href={pkg.data.urls.git_browser}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline"
                      >
                        {pkg.data.urls.git_browser}
                      </a>
                    </div>
                  )}
                  {pkg.data.urls.git && (
                    <div>
                      <div className="text-sm font-medium mb-1">Git URL</div>
                      <div className="text-sm text-muted-foreground font-mono">
                        {pkg.data.urls.git}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}
