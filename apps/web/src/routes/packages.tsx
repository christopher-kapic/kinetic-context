import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

import { orpc } from "@/utils/orpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CreatePackageDialog } from "@/components/dialogs/create-package-dialog";
import { Plus, Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/packages")({
  component: PackagesComponent,
});

function PackagesComponent() {
  const [scanDialogOpen, setScanDialogOpen] = useState(false);
  const packages = useQuery(orpc.packages.list.queryOptions());
  const queryClient = useQueryClient();

  const scanQuery = useQuery(orpc.packages.scanProjects.queryOptions());
  
  const handleScan = () => {
    scanQuery.refetch();
    setScanDialogOpen(true);
  };
      onSuccess: (data) => {
        toast.success(`Found ${data.length} git repositories`);
      },
      onError: (error: any) => {
        toast.error(error.message || "Failed to scan projects directory");
      },
    })
  );

  const handleScan = () => {
    scanMutation.mutate();
    setScanDialogOpen(true);
  };

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Packages</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Manage your package configurations
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleScan}
            disabled={scanQuery.isFetching}
            className="w-full sm:w-auto"
          >
            <Search className="size-4 mr-2" />
            {scanQuery.isFetching ? "Scanning..." : "Scan Projects"}
          </Button>
          <CreatePackageDialog>
            <Button className="w-full sm:w-auto">
              <Plus className="size-4 mr-2" />
              Create Package
            </Button>
          </CreatePackageDialog>
        </div>
      </div>

      <Dialog open={scanDialogOpen} onOpenChange={setScanDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Scan Projects Directory</DialogTitle>
            <DialogDescription>
              Found git repositories in your projects directory. Select which ones to add as packages.
            </DialogDescription>
          </DialogHeader>
          {scanQuery.isFetching ? (
            <div className="py-8 text-center">
              <Loader2 className="size-8 animate-spin mx-auto mb-4" />
              <p>Scanning projects directory...</p>
            </div>
          ) : scanQuery.data && scanQuery.data.length > 0 ? (
            <div className="space-y-2">
              {scanQuery.data.map((repo, index) => (
                <Card key={index} className={repo.alreadyExists ? "opacity-60" : ""}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium mb-1">
                          {repo.suggestedIdentifier}
                          {repo.alreadyExists && (
                            <span className="ml-2 text-xs text-muted-foreground">(already exists)</span>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground font-mono truncate" title={repo.path}>
                          {repo.relativePath}
                        </div>
                      </div>
                      {!repo.alreadyExists && (
                        <CreatePackageDialog
                          onSuccess={() => {
                            queryClient.invalidateQueries({ queryKey: orpc.packages.list.key() });
                            scanQuery.refetch();
                          }}
                        >
                          <Button size="sm" variant="outline">
                            Add
                          </Button>
                        </CreatePackageDialog>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center">
              <p className="text-muted-foreground">No git repositories found in projects directory.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setScanDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                        {pkg.storage_type === "cloned" ? "Cloned" : pkg.storage_type === "local" ? "Local" : "Existing"}
                      </span>
                    </div>
                    <div>Manager: {pkg.package_manager || "N/A"}</div>
                    {pkg.storage_type === "cloned" && (
                      <div>Tag: {pkg.default_tag || "N/A"}</div>
                    )}
                    {(pkg.storage_type === "local" || pkg.storage_type === "existing") && (
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
