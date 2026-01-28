import { lazy, Suspense } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Trash2, Package, ArrowLeft } from "lucide-react";

// Lazy load dialogs for code splitting
const ManagePackagesDialog = lazy(() =>
  import("@/components/dialogs/add-package-dialog").then((mod) => ({
    default: mod.ManagePackagesDialog,
  }))
);

export const Route = createFileRoute("/project/$identifier")({
  component: ProjectDetailComponent,
});

function ProjectDetailComponent() {
  const { identifier } = Route.useParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const project = useQuery(orpc.projects.get.queryOptions({ input: { identifier } }));
  const packages = useQuery(orpc.packages.list.queryOptions());

  const deleteProjectMutation = useMutation(
    orpc.projects.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.projects.list.key() });
        toast.success("Project deleted");
        navigate({ to: "/projects" });
      },
      onError: (error: any) => {
        toast.error(error.message || "Failed to delete project");
      },
    })
  );

  const removeDependencyMutation = useMutation(
    orpc.projects.removeDependency.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.projects.get.key({ input: { identifier } }) });
        toast.success("Dependency removed");
      },
      onError: (error: any) => {
        toast.error(error.message || "Failed to remove dependency");
      },
    })
  );

  if (project.isLoading) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-6 sm:py-8">
        <Skeleton className="h-8 w-48 mb-4" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!project.data) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-6 sm:py-8">
        <p>Project not found</p>
      </div>
    );
  }

  const handleRemoveDependency = (depIdentifier: string) => {
    if (confirm(`Remove dependency "${depIdentifier}"?`)) {
      removeDependencyMutation.mutate({
        projectIdentifier: identifier,
        dependencyIdentifier: depIdentifier,
      });
    }
  };

  const handleDeleteProject = () => {
    if (confirm(`Delete project "${project.data?.display_name}"? This cannot be undone.`)) {
      deleteProjectMutation.mutate({ identifier });
    }
  };

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6 sm:py-8">
      <div className="mb-6 sm:mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <Link to="/projects">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="size-4 mr-2" />
              Back to Projects
            </Button>
          </Link>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDeleteProject}
            disabled={deleteProjectMutation.isPending}
          >
            <Trash2 className="size-4 mr-2" />
            Delete Project
          </Button>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold">{project.data.display_name}</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">
          {project.data.identifier}
        </p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Dependencies</CardTitle>
            <CardDescription>
              Packages used by this project
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Suspense fallback={<Button className="w-full sm:w-auto" disabled><Package className="size-4 mr-2" />Manage Packages</Button>}>
              <ManagePackagesDialog
                projectIdentifier={identifier}
                existingPackages={packages.data || []}
                currentDependencies={project.data.dependencies}
              >
                <Button className="w-full sm:w-auto">
                  <Package className="size-4 mr-2" />
                  Manage Packages
                </Button>
              </ManagePackagesDialog>
            </Suspense>

            {project.data.dependencies.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                No dependencies yet. Add a package to get started.
              </p>
            ) : (
              <div className="space-y-2">
                {project.data.dependencies.map((dep) => {
                  const pkg = packages.data?.find((p) => p.identifier === dep.identifier);
                  return (
                    <div
                      key={dep.identifier}
                      className="flex items-center justify-between p-3 border rounded-none"
                    >
                      <div className="flex items-center gap-2">
                        {pkg?.urls?.logo && (
                          <img
                            src={pkg.urls.logo}
                            alt={`${pkg.display_name || dep.identifier} logo`}
                            className="size-5 object-contain"
                          />
                        )}
                        <div>
                          <div className="font-medium text-sm">
                            {pkg?.display_name || dep.identifier}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {dep.identifier}
                            {dep.tag && ` @ ${dep.tag}`}
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleRemoveDependency(dep.identifier)}
                        disabled={removeDependencyMutation.isPending}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
