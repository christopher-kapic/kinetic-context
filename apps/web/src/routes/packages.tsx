import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

import { orpc } from "@/utils/orpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CreatePackageDialog } from "@/components/dialogs/create-package-dialog";
import { Plus, Loader2 } from "lucide-react";

export const Route = createFileRoute("/packages")({
  component: PackagesComponent,
});

function PackagesComponent() {
  const packages = useQuery(orpc.packages.list.queryOptions());

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Packages</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Manage your package configurations
          </p>
        </div>
        <CreatePackageDialog>
          <Button className="w-full sm:w-auto">
            <Plus className="size-4 mr-2" />
            Create Package
          </Button>
        </CreatePackageDialog>
      </div>

      {packages.isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-24 mt-2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : packages.data && packages.data.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {packages.data.map((pkg) => (
            <Link
              key={pkg.identifier}
              to="/package/$identifier"
              params={{ identifier: pkg.identifier }}
            >
              <Card className="hover:bg-accent transition-colors cursor-pointer h-full">
                <CardHeader>
                  <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                    {pkg.urls?.logo && (
                      <img
                        src={pkg.urls.logo}
                        alt={`${pkg.display_name} logo`}
                        className="size-6 object-contain"
                      />
                    )}
                    {pkg.display_name}
                    {pkg.cloneStatus === "cloning" && (
                      <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    )}
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    {pkg.identifier}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-xs sm:text-sm text-muted-foreground space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">
                        {pkg.storage_type === "cloned" ? "Cloned" : "Existing"}
                      </span>
                    </div>
                    <div>Manager: {pkg.package_manager || "N/A"}</div>
                    {pkg.storage_type === "cloned" && (
                      <div>Tag: {pkg.default_tag || "N/A"}</div>
                    )}
                    {pkg.storage_type === "existing" && (
                      <div className="text-xs font-mono truncate" title={pkg.repo_path}>
                        Path: {pkg.repo_path}
                      </div>
                    )}
                    {pkg.cloneStatus && pkg.cloneStatus !== "completed" && (
                      <div className="text-xs">
                        Status: {pkg.cloneStatus}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground text-center mb-4">
              No packages yet. Create your first package to get started.
            </p>
            <CreatePackageDialog>
              <Button>
                <Plus className="size-4 mr-2" />
                Create Package
              </Button>
            </CreatePackageDialog>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
