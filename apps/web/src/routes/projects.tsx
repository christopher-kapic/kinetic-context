import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

import { orpc } from "@/utils/orpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateProjectDialog } from "@/components/dialogs/create-project-dialog";
import { Plus, Search, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/projects")({
  component: ProjectsComponent,
});

function ProjectsComponent() {
  const [scanDialogOpen, setScanDialogOpen] = useState(false);
  const projects = useQuery(orpc.projects.list.queryOptions());
  const queryClient = useQueryClient();

  const scanQuery = useQuery(orpc.projects.scanProjects.queryOptions());
  
  const handleScan = () => {
    scanQuery.refetch();
    setScanDialogOpen(true);
  };

  const createProjectMutation = useMutation(
    orpc.projects.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.projects.list.key() });
        scanQuery.refetch();
        toast.success("Project created successfully");
      },
      onError: (error: any) => {
        toast.error(error.message || "Failed to create project");
      },
    })
  );

  const handleQuickAdd = (repo: { suggestedIdentifier: string; suggestedDisplayName: string; path: string }) => {
    createProjectMutation.mutate({
      identifier: repo.suggestedIdentifier,
      display_name: repo.suggestedDisplayName,
      urls: {},
    });
  };

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Projects</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Manage your project configurations
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={handleScan}
            disabled={scanQuery.isFetching}
            className="w-full sm:w-auto"
          >
            <Search className="size-4 mr-2" />
            {scanQuery.isFetching ? "Scanning..." : "Scan Projects"}
          </Button>
          <CreateProjectDialog>
            <Button className="w-full sm:w-auto">
              <Plus className="size-4 mr-2" />
              Create Project
            </Button>
          </CreateProjectDialog>
        </div>
      </div>

      <Dialog open={scanDialogOpen} onOpenChange={setScanDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Scan Projects Directory</DialogTitle>
            <DialogDescription>
              Found git repositories in your projects directory. Click "Add" to create a project with default settings.
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
                          {repo.suggestedDisplayName}
                          {repo.alreadyExists && (
                            <span className="ml-2 text-xs text-muted-foreground">(already exists)</span>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Identifier: <span className="font-mono">{repo.suggestedIdentifier}</span>
                        </div>
                        <div className="text-sm text-muted-foreground font-mono truncate mt-1" title={repo.path}>
                          {repo.relativePath}
                        </div>
                      </div>
                      {!repo.alreadyExists && (
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handleQuickAdd(repo)}
                          disabled={createProjectMutation.isPending}
                        >
                          {createProjectMutation.isPending ? (
                            <>
                              <Loader2 className="size-4 mr-2 animate-spin" />
                              Adding...
                            </>
                          ) : (
                            "Add"
                          )}
                        </Button>
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

      {projects.isLoading ? (
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
      ) : projects.data && projects.data.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.data.map((project) => (
            <Link
              key={project.identifier}
              to="/project/$identifier"
              params={{ identifier: project.identifier }}
            >
              <Card className="hover:bg-accent transition-colors cursor-pointer h-full">
                <CardHeader>
                  <CardTitle className="text-base sm:text-lg">
                    {project.display_name}
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    {project.identifier}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-xs sm:text-sm text-muted-foreground">
                    {project.dependencies.length} dependency
                    {project.dependencies.length !== 1 ? "s" : ""}
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
              No projects yet. Create your first project to get started.
            </p>
            <CreateProjectDialog>
              <Button>
                <Plus className="size-4 mr-2" />
                Create Project
              </Button>
            </CreateProjectDialog>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
