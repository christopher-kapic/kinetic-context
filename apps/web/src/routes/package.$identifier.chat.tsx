import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { orpc } from "@/utils/orpc";
import { PackageChat } from "@/components/package-chat";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/package/$identifier/chat")({
  component: PackageChatPage,
});

function PackageChatPage() {
  const { identifier } = Route.useParams();
  const pkg = useQuery(orpc.packages.get.queryOptions({ input: { identifier } }));

  if (pkg.isLoading) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-6 sm:py-8">
        <Skeleton className="h-8 w-48 mb-4" />
        <Skeleton className="h-[600px] w-full" />
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
      <div className="mb-6 sm:mb-8">
        <div className="flex items-center gap-4 mb-2">
          <Link
            to="/package/$identifier"
            params={{ identifier }}
          >
            <Button variant="ghost" size="icon">
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
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
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1">
              {pkg.data.identifier}
            </p>
          </div>
        </div>
      </div>

      <div className="h-[calc(100vh-12rem)] min-h-[600px]">
        <PackageChat packageIdentifier={identifier} />
      </div>
    </div>
  );
}
