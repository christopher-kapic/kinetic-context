import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AddPackageDialog } from "@/components/dialogs/add-package-dialog";
import { Trash2, Plus } from "lucide-react";

export const Route = createFileRoute("/project/$identifier")({
  component: ProjectDetailComponent,
});

function ProjectDetailComponent() {
  const { identifier } = Route.useParams();
  const queryClient = useQueryClient();

  const project = useQuery(orpc.projects.get.queryOptions({ input: { identifier } }));
  const packages = useQuery(orpc.packages.list.queryOptions());

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

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6 sm:py-8">
      <div className="mb-6 sm:mb-8">
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
            <AddPackageDialog
              projectIdentifier={identifier}
              existingPackages={packages.data || []}
            >
              <Button className="w-full sm:w-auto">
                <Plus className="size-4 mr-2" />
                Add Package
              </Button>
            </AddPackageDialog>

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
                      <div>
                        <div className="font-medium text-sm">
                          {pkg?.display_name || dep.identifier}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {dep.identifier}
                          {dep.tag && ` @ ${dep.tag}`}
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
