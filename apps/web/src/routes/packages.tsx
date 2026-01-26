import { useState, lazy, Suspense } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

import { orpc } from "@/utils/orpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Loader2, Search, X, Download, Upload, Copy, RefreshCw } from "lucide-react";

// Lazy load dialogs for code splitting
const CreatePackageDialog = lazy(() =>
  import("@/components/dialogs/create-package-dialog").then((mod) => ({
    default: mod.CreatePackageDialog,
  }))
);
const ExportPackagesDialog = lazy(() =>
  import("@/components/dialogs/export-packages-dialog").then((mod) => ({
    default: mod.ExportPackagesDialog,
  }))
);
const ImportPackagesDialog = lazy(() =>
  import("@/components/dialogs/import-packages-dialog").then((mod) => ({
    default: mod.ImportPackagesDialog,
  }))
);
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/packages")({
  component: PackagesComponent,
});

type FilterType = "all" | "projects" | "packages";

function PackagesComponent() {
  const [scanDialogOpen, setScanDialogOpen] = useState(false);
  const [updateConfirmOpen, setUpdateConfirmOpen] = useState(false);
  const [filter, setFilter] = useState<FilterType>("all");
  const packages = useQuery(orpc.packages.list.queryOptions());
  const queryClient = useQueryClient();

  const scanQuery = useQuery(orpc.packages.scanProjects.queryOptions());
  
  const handleScan = () => {
    scanQuery.refetch();
    setScanDialogOpen(true);
  };

  const handleCopyIdentifier = async (e: React.MouseEvent, identifier: string) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(identifier);
      toast.success("Package ID copied to clipboard");
    } catch (error) {
      toast.error("Failed to copy package ID");
    }
  };

  const updateAllMutation = useMutation(
    orpc.packages.updateAll.mutationOptions({
      onSuccess: (results) => {
        const successCount = results.filter((r: any) => r.success).length;
        const failedCount = results.length - successCount;

        if (failedCount === 0) {
          toast.success(`Successfully updated ${successCount} package(s)`);
        } else {
          toast.error(`Updated ${successCount} package(s), ${failedCount} failed to update`);
        }

        queryClient.invalidateQueries({ queryKey: orpc.packages.list.key() });
        setUpdateConfirmOpen(false);
      },
    })
  );

  // Filter packages based on storage_type
  const filteredPackages = packages.data?.filter((pkg) => {
    if (filter === "all") return true;
    if (filter === "projects") {
      // Projects are local repositories
      return pkg.storage_type === "local";
    }
    if (filter === "packages") {
      // Packages are cloned repositories
      return pkg.storage_type === "cloned";
    }
    return true;
  }) || [];

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Packages</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Manage your package configurations
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <Select value={filter} onValueChange={(value) => setFilter(value as FilterType)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="projects">Projects</SelectItem>
              <SelectItem value="packages">Packages</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={handleScan}
            disabled={scanQuery.isFetching}
            className="w-full sm:w-auto"
          >
            <Search className="size-4 mr-2" />
            {scanQuery.isFetching ? "Scanning..." : "Scan Projects"}
          </Button>
          <Suspense fallback={<Button variant="outline" className="w-full sm:w-auto" disabled><Upload className="size-4 mr-2" />Export</Button>}>
            <ExportPackagesDialog>
              <Button variant="outline" className="w-full sm:w-auto">
                <Upload className="size-4 mr-2" />
                Export
              </Button>
            </ExportPackagesDialog>
          </Suspense>
          <Suspense fallback={<Button variant="outline" className="w-full sm:w-auto" disabled><Download className="size-4 mr-2" />Import</Button>}>
            <ImportPackagesDialog>
              <Button variant="outline" className="w-full sm:w-auto">
                <Download className="size-4 mr-2" />
                Import
              </Button>
            </ImportPackagesDialog>
          </Suspense>
          <Button
            variant="outline"
            onClick={() => setUpdateConfirmOpen(true)}
            className="w-full sm:w-auto"
          >
            <RefreshCw className="size-4 mr-2" />
            Update All
          </Button>
          <Suspense fallback={<Button className="w-full sm:w-auto" disabled><Plus className="size-4 mr-2" />Create Package</Button>}>
            <CreatePackageDialog>
              <Button className="w-full sm:w-auto">
                <Plus className="size-4 mr-2" />
                Create Package
              </Button>
            </CreatePackageDialog>
          </Suspense>
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
                        <Suspense fallback={<Button size="sm" variant="outline" disabled>Add</Button>}>
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
                        </Suspense>
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

      <Dialog open={updateConfirmOpen} onOpenChange={setUpdateConfirmOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Update All Packages</DialogTitle>
            <DialogDescription>
              This will pull the latest changes from git for all cloned packages. Local packages will be skipped.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUpdateConfirmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => updateAllMutation.mutate(undefined)} disabled={updateAllMutation.isPending}>
              {updateAllMutation.isPending ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                "Confirm Update"
              )}
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
      ) : filteredPackages.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPackages.map((pkg) => (
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
                  <CardDescription className="text-xs sm:text-sm flex items-center gap-1.5">
                    <span>{pkg.identifier}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 -mr-1"
                      onClick={(e) => handleCopyIdentifier(e, pkg.identifier)}
                      title="Copy package ID"
                    >
                      <Copy className="size-3" />
                    </Button>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-xs sm:text-sm text-muted-foreground space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">
                        {pkg.storage_type === "cloned" ? "Cloned" : "Local"}
                      </span>
                    </div>
                    <div>Manager: {pkg.package_manager || "N/A"}</div>
                    {pkg.storage_type === "cloned" && (
                      <div>Tag: {pkg.default_tag || "N/A"}</div>
                    )}
                    {pkg.storage_type === "local" && (
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
      ) : packages.data && packages.data.length > 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground text-center mb-4">
              No {filter === "projects" ? "projects" : filter === "packages" ? "packages" : "items"} match the current filter.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground text-center mb-4">
              No packages yet. Create your first package to get started.
            </p>
            <Suspense fallback={<Button disabled><Plus className="size-4 mr-2" />Create Package</Button>}>
              <CreatePackageDialog>
                <Button>
                  <Plus className="size-4 mr-2" />
                  Create Package
                </Button>
              </CreatePackageDialog>
            </Suspense>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
