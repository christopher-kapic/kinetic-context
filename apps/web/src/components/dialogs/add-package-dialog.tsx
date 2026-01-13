import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { toast } from "sonner";

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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { orpc } from "@/utils/orpc";
import { CreatePackageDialog } from "./create-package-dialog";

const addPackageSchema = z.object({
  packageIdentifier: z.string().min(1, "Package is required"),
  tag: z.string().optional(),
});

type AddPackageForm = z.infer<typeof addPackageSchema>;

interface AddPackageDialogProps {
  children: React.ReactNode;
  projectIdentifier: string;
  existingPackages: Array<{
    identifier: string;
    display_name: string;
    default_tag: string;
    cloneStatus?: string;
  }>;
}

export function AddPackageDialog({
  children,
  projectIdentifier,
  existingPackages,
}: AddPackageDialogProps) {
  const [open, setOpen] = useState(false);
  const [showCreatePackage, setShowCreatePackage] = useState(false);
  const queryClient = useQueryClient();

  const mutation = useMutation(
    orpc.projects.addDependency.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: orpc.projects.get.key({ input: { identifier: projectIdentifier } }),
        });
        toast.success("Package added to project");
        setOpen(false);
        form.reset();
      },
      onError: (error: any) => {
        toast.error(error.message || "Failed to add package");
      },
    })
  );

  const form = useForm<AddPackageForm>({
    defaultValues: {
      packageIdentifier: "",
      tag: "",
    },
    validators: {
      onChange: addPackageSchema,
    },
    onSubmit: async ({ value }) => {
      const selectedPackage = existingPackages.find(
        (p) => p.identifier === value.packageIdentifier
      );
      mutation.mutate({
        projectIdentifier,
        dependency: {
          identifier: value.packageIdentifier,
          tag: value.tag || selectedPackage?.default_tag || undefined,
        },
      });
    },
  });

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
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Package to Project</DialogTitle>
          <DialogDescription>
            Select an existing package or create a new one to add to this project.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
          className="space-y-4"
        >
          <form.Field name="packageIdentifier">
            {(field) => {
              const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
              return (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>Package *</Label>
                  <Select
                    value={field.state.value}
                    onValueChange={(value) => field.handleChange(value)}
                  >
                    <SelectTrigger id={field.name} aria-invalid={isInvalid}>
                      <SelectValue placeholder="Select a package" />
                    </SelectTrigger>
                    <SelectContent>
                      {existingPackages.map((pkg) => (
                        <SelectItem key={pkg.identifier} value={pkg.identifier}>
                          {pkg.display_name} ({pkg.identifier})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {isInvalid && field.state.meta.errors && (
                    <p className="text-xs text-destructive">
                      {field.state.meta.errors[0]?.message || "Invalid value"}
                    </p>
                  )}
                </div>
              );
            }}
          </form.Field>

          <form.Field name="tag">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>Tag (optional)</Label>
                <Input
                  id={field.name}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  placeholder="Leave empty to use default tag"
                />
              </div>
            )}
          </form.Field>

          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowCreatePackage(true)}
              className="w-full sm:w-auto"
            >
              Create New Package
            </Button>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Adding..." : "Add Package"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
