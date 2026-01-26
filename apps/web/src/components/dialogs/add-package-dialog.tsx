import { useState, useEffect, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { orpc } from "@/utils/orpc";
import { CreatePackageDialog } from "./create-package-dialog";

interface ManagePackagesDialogProps {
  children: React.ReactNode;
  projectIdentifier: string;
  existingPackages: Array<{
    identifier: string;
    display_name: string;
    default_tag: string;
    cloneStatus?: string;
    urls?: {
      logo?: string;
    };
  }>;
  currentDependencies: Array<{
    identifier: string;
    tag?: string;
  }>;
}

export function ManagePackagesDialog({
  children,
  projectIdentifier,
  existingPackages,
  currentDependencies,
}: ManagePackagesDialogProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [checkedPackages, setCheckedPackages] = useState<Set<string>>(new Set());
  const [initialChecked, setInitialChecked] = useState<Set<string>>(new Set());
  const [showCreatePackage, setShowCreatePackage] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const queryClient = useQueryClient();

  // Initialize checked packages when dialog opens
  useEffect(() => {
    if (open) {
      const currentDepsSet = new Set(currentDependencies.map((dep) => dep.identifier));
      setInitialChecked(new Set(currentDepsSet));
      setCheckedPackages(new Set(currentDepsSet));
      setSearchQuery("");
    }
  }, [open, currentDependencies]);

  // Filter packages based on search query
  const filteredPackages = useMemo(() => {
    if (!searchQuery.trim()) {
      return existingPackages;
    }
    const query = searchQuery.toLowerCase();
    return existingPackages.filter(
      (pkg) =>
        pkg.display_name.toLowerCase().includes(query) ||
        pkg.identifier.toLowerCase().includes(query)
    );
  }, [existingPackages, searchQuery]);

  const updateDependenciesMutation = useMutation(
    orpc.projects.updateDependencies.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: orpc.projects.get.key({ input: { identifier: projectIdentifier } }),
        });
      },
      onError: (error: any) => {
        // Error handling is done in the handler
        console.error("Error updating dependencies:", error);
      },
    })
  );

  const handleTogglePackage = (packageIdentifier: string) => {
    setCheckedPackages((prev) => {
      const next = new Set(prev);
      if (next.has(packageIdentifier)) {
        next.delete(packageIdentifier);
      } else {
        next.add(packageIdentifier);
      }
      return next;
    });
  };

  const handleApplyChanges = async () => {
    if (!projectIdentifier || projectIdentifier.trim() === "") {
      toast.error("Invalid project identifier");
      return;
    }

    setIsApplying(true);

    try {
      // Calculate packages to add and remove
      const toAddIdentifiers = Array.from(checkedPackages).filter(
        (id) => !initialChecked.has(id)
      );
      const toRemoveIdentifiers = Array.from(initialChecked).filter(
        (id) => !checkedPackages.has(id)
      );

      if (toAddIdentifiers.length === 0 && toRemoveIdentifiers.length === 0) {
        setIsApplying(false);
        return;
      }

      // Prepare dependencies to add with their tags
      const toAdd = toAddIdentifiers.map((packageIdentifier) => {
        const pkg = existingPackages.find((p) => p.identifier === packageIdentifier);
        return {
          identifier: packageIdentifier,
          tag: pkg?.default_tag || undefined,
        };
      });

      // Execute bulk update (atomic operation)
      await updateDependenciesMutation.mutateAsync({
        projectIdentifier,
        toAdd: toAdd.length > 0 ? toAdd : undefined,
        toRemove: toRemoveIdentifiers.length > 0 ? toRemoveIdentifiers : undefined,
      });

      // Show success message
      const parts: string[] = [];
      if (toAdd.length > 0) parts.push(`added ${toAdd.length}`);
      if (toRemoveIdentifiers.length > 0) parts.push(`removed ${toRemoveIdentifiers.length}`);
      
      toast.success(
        `Successfully ${parts.join(" and ")} package${toAdd.length + toRemoveIdentifiers.length > 1 ? "s" : ""}`
      );

      // Close dialog on success
      setOpen(false);
    } catch (error: any) {
      // Handle specific error cases
      if (error?.code === "NOT_FOUND") {
        toast.error(`Project not found: ${error.message || "The project may have been deleted"}`);
      } else if (error?.code === "CONFLICT") {
        // Handle duplicate dependencies
        const duplicates = error?.data?.duplicates || [];
        if (duplicates.length > 0) {
          toast.error(
            `Some packages are already in the project: ${duplicates.join(", ")}`
          );
        } else {
          toast.error(error.message || "Some packages could not be added");
        }
      } else {
        toast.error(error?.message || "Failed to update dependencies");
      }
      // Don't close dialog on error so user can retry
    } finally {
      setIsApplying(false);
    }
  };

  const hasChanges = useMemo(() => {
    if (checkedPackages.size !== initialChecked.size) return true;
    for (const id of checkedPackages) {
      if (!initialChecked.has(id)) return true;
    }
    for (const id of initialChecked) {
      if (!checkedPackages.has(id)) return true;
    }
    return false;
  }, [checkedPackages, initialChecked]);

  if (showCreatePackage) {
    return (
      <CreatePackageDialog
        onSuccess={() => {
          setShowCreatePackage(false);
          queryClient.invalidateQueries({ queryKey: orpc.packages.list.key() });
        }}
        onCancel={() => setShowCreatePackage(false)}
      >
        {children}
      </CreatePackageDialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Manage Packages</DialogTitle>
          <DialogDescription>
            Select packages to add or remove from this project. Packages already in the project are checked.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 flex-1 min-h-0">
          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search packages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>

          {/* Package list */}
          <div className="flex-1 overflow-y-auto border rounded-none">
            {filteredPackages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4">
                <p className="text-sm text-muted-foreground text-center mb-4">
                  {searchQuery.trim()
                    ? "No packages match your search."
                    : "No packages available."}
                </p>
                {!searchQuery.trim() && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowCreatePackage(true)}
                    className="w-full sm:w-auto"
                  >
                    Create New Package
                  </Button>
                )}
              </div>
            ) : (
              <div className="divide-y">
                {filteredPackages.map((pkg) => {
                  const isChecked = checkedPackages.has(pkg.identifier);
                  const wasInitiallyChecked = initialChecked.has(pkg.identifier);
                  const isNew = !wasInitiallyChecked && isChecked;
                  const isRemoved = wasInitiallyChecked && !isChecked;

                  return (
                    <label
                      key={pkg.identifier}
                      className="flex items-center gap-3 p-3 hover:bg-accent cursor-pointer transition-colors"
                    >
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={() => handleTogglePackage(pkg.identifier)}
                        disabled={isApplying}
                      />
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {pkg.urls?.logo && (
                          <img
                            src={pkg.urls.logo}
                            alt={`${pkg.display_name} logo`}
                            className="size-5 object-contain shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm flex items-center gap-2">
                            {pkg.display_name}
                            {isNew && (
                              <span className="text-xs text-primary font-normal">
                                (new)
                              </span>
                            )}
                            {isRemoved && (
                              <span className="text-xs text-destructive font-normal">
                                (removed)
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {pkg.identifier}
                          </div>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowCreatePackage(true)}
            className="mr-auto"
          >
            Create New Package
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isApplying}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleApplyChanges}
            disabled={isApplying || !hasChanges}
          >
            {isApplying ? "Applying..." : "Apply Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
