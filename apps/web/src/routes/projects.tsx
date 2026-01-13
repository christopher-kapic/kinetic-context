import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

import { orpc } from "@/utils/orpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateProjectDialog } from "@/components/dialogs/create-project-dialog";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/projects")({
  component: ProjectsComponent,
});

function ProjectsComponent() {
  const projects = useQuery(orpc.projects.list.queryOptions());

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Projects</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Manage your project configurations
          </p>
        </div>
        <CreateProjectDialog>
          <Button className="w-full sm:w-auto">
            <Plus className="size-4 mr-2" />
            Create Project
          </Button>
        </CreateProjectDialog>
      </div>

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
