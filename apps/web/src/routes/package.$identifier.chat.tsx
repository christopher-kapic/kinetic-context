import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { orpc } from "@/utils/orpc";
import { PackageChat } from "@/components/package-chat";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Copy } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/package/$identifier/chat")({
  component: PackageChatPage,
});

function PackageChatPage() {
  const { identifier } = Route.useParams();
  const pkg = useQuery(orpc.packages.get.queryOptions({ input: { identifier } }));

  const handleCopyIdentifier = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(identifier);
      toast.success("Package ID copied to clipboard");
    } catch (error) {
      toast.error("Failed to copy package ID");
    }
  };

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
            <div className="flex items-center gap-2 mt-1">
              <p className="text-sm sm:text-base text-muted-foreground">
                {pkg.data.identifier}
              </p>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handleCopyIdentifier}
                title="Copy package ID"
              >
                <Copy className="size-3" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="h-[calc(100vh-12rem)] min-h-[600px]">
        <PackageChat packageIdentifier={identifier} />
      </div>
    </div>
  );
}
