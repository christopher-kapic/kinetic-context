import { useState, useEffect, Fragment } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";

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
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { orpc } from "@/utils/orpc";

const createPackageSchema = z.object({
  identifier: z.string().min(1, "Identifier is required"),
  package_manager: z.string(), // Can be empty
  display_name: z.string().min(1, "Display name is required"),
  storage_type: z.enum(["cloned", "existing"]),
  repo_path: z.string().min(1, "Repository path is required"),
  default_tag_auto: z.boolean(),
  default_tag: z.string().optional(),
  git: z.string().url("Git URL must be a valid URL").optional().or(z.literal("")),
  website: z.string().url().optional().or(z.literal("")),
  docs: z.string().url().optional().or(z.literal("")),
  git_browser: z.string().url().optional().or(z.literal("")),
  logo: z.string().url().optional().or(z.literal("")),
}).refine((data) => {
  // For cloned repos, git URL is required
  if (data.storage_type === "cloned" && !data.git) {
    return false;
  }
  // For cloned repos, if auto is not selected, default_tag is required
  if (data.storage_type === "cloned" && !data.default_tag_auto && !data.default_tag) {
    return false;
  }
  return true;
}, {
  message: "Validation failed",
  path: ["storage_type"],
});

type CreatePackageForm = z.infer<typeof createPackageSchema>;

interface CreatePackageDialogProps {
  children: React.ReactNode;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function CreatePackageDialog({
  children,
  onSuccess,
  onCancel,
}: CreatePackageDialogProps) {
  const [open, setOpen] = useState(false);
  const [identifier, setIdentifier] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const mutation = useMutation(
    orpc.packages.create.mutationOptions({
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: orpc.packages.list.key() });
        queryClient.invalidateQueries({ queryKey: orpc.stats.get.key() });
        toast.success("Package created successfully");
        setIdentifier(data.identifier);
        setOpen(false);
        form.reset();
        onSuccess?.();
      },
      onError: (error: any) => {
        toast.error(error.message || "Failed to create package");
      },
    })
  );

  // Poll clone status if package was created
  const cloneStatus = useQuery({
    ...orpc.packages.getCloneStatus.queryOptions({
      input: { identifier: identifier! },
    }),
    enabled: !!identifier,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "pending" || status === "cloning" ? 2000 : false;
    },
  });

  const form = useForm<CreatePackageForm>({
    defaultValues: {
      identifier: "",
      package_manager: "",
      display_name: "",
      storage_type: "cloned",
      repo_path: "",
      default_tag_auto: false,
      default_tag: "main",
      git: "",
      website: "",
      docs: "",
      git_browser: "",
      logo: "",
    },
    validators: {
      onChange: createPackageSchema,
    },
    onSubmit: async ({ value }) => {
      mutation.mutate({
        identifier: value.identifier,
        package_manager: value.package_manager,
        display_name: value.display_name,
        storage_type: value.storage_type,
        repo_path: value.repo_path,
        default_tag: value.storage_type === "cloned" 
          ? (value.default_tag_auto ? "auto" : value.default_tag || "main")
          : undefined,
        urls: {
          git: value.storage_type === "cloned" ? value.git : undefined,
          website: value.website || undefined,
          docs: value.docs || undefined,
          git_browser: value.git_browser || undefined,
          logo: value.logo || undefined,
        },
      });
    },
  });

  useEffect(() => {
    if (!open) {
      setIdentifier(null);
    }
  }, [open]);

  const handleCancel = () => {
    setOpen(false);
    onCancel?.();
  };

  return (
    <Dialog open={open} onOpenChange={(newOpen) => {
      setOpen(newOpen);
      if (!newOpen) {
        handleCancel();
      }
    }}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create Package</DialogTitle>
          <DialogDescription>
            Create a new package configuration. Choose to clone a repository or use an existing one.
          </DialogDescription>
        </DialogHeader>
        {identifier && cloneStatus.data?.status && (
          <div className="p-3 bg-muted rounded-none text-sm">
            Clone status: {cloneStatus.data.status}
            {cloneStatus.data.status === "cloning" && " (this may take a while...)"}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
          className="space-y-4"
        >
          <form.Field name="identifier">
            {(field) => {
              const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
              return (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>Identifier *</Label>
                  <Input
                    id={field.name}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    placeholder="@example/package"
                    aria-invalid={isInvalid}
                  />
                  {isInvalid && field.state.meta.errors && (
                    <p className="text-xs text-destructive">
                      {field.state.meta.errors[0]?.message || "Invalid value"}
                    </p>
                  )}
                </div>
              );
            }}
          </form.Field>

          <form.Field name="package_manager">
            {(field) => {
              const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
              return (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>Package Manager</Label>
                  <Input
                    id={field.name}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    placeholder="npm, cargo, pip, etc. (optional)"
                    aria-invalid={isInvalid}
                  />
                  {isInvalid && field.state.meta.errors && (
                    <p className="text-xs text-destructive">
                      {field.state.meta.errors[0]?.message || "Invalid value"}
                    </p>
                  )}
                </div>
              );
            }}
          </form.Field>

          <form.Field name="display_name">
            {(field) => {
              const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
              return (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>Display Name *</Label>
                  <Input
                    id={field.name}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    placeholder="Example Package"
                    aria-invalid={isInvalid}
                  />
                  {isInvalid && field.state.meta.errors && (
                    <p className="text-xs text-destructive">
                      {field.state.meta.errors[0]?.message || "Invalid value"}
                    </p>
                  )}
                </div>
              );
            }}
          </form.Field>

          <form.Field name="storage_type">
            {(field) => {
              const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
              return (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>Storage Type *</Label>
                  <Select
                    value={field.state.value}
                    onValueChange={(value) => {
                      field.handleChange(value as "cloned" | "existing");
                      // Reset repo_path when switching types
                      form.setFieldValue("repo_path", "");
                      if (value === "existing") {
                        form.setFieldValue("git", "");
                        form.setFieldValue("default_tag_auto", false);
                        form.setFieldValue("default_tag", "");
                      } else {
                        form.setFieldValue("default_tag", "main");
                      }
                    }}
                  >
                    <SelectTrigger id={field.name} aria-invalid={isInvalid}>
                      <SelectValue placeholder="Select storage type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cloned">Clone Repository</SelectItem>
                      <SelectItem value="existing">Use Existing Repository</SelectItem>
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

          {form.state.values.storage_type === "existing" ? (
            <form.Field name="repo_path">
              {(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <div className="space-y-2">
                    <Label htmlFor={field.name}>Repository Path *</Label>
                    <Input
                      id={field.name}
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      placeholder="/path/to/repository"
                      aria-invalid={isInvalid}
                    />
                    <p className="text-xs text-muted-foreground">
                      Absolute path to an existing git repository on your machine
                    </p>
                    {isInvalid && field.state.meta.errors && (
                      <p className="text-xs text-destructive">
                        {field.state.meta.errors[0]?.message || "Invalid value"}
                      </p>
                    )}
                  </div>
                );
              }}
            </form.Field>
          ) : (
            <Fragment>
              <form.Field name="git">
                {(field) => {
                  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                  return (
                    <div className="space-y-2">
                      <Label htmlFor={field.name}>Git URL *</Label>
                      <Input
                        id={field.name}
                        type="url"
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        onBlur={field.handleBlur}
                        placeholder="https://github.com/user/repo.git"
                        aria-invalid={isInvalid}
                      />
                      {isInvalid && field.state.meta.errors && (
                        <p className="text-xs text-destructive">
                          {field.state.meta.errors[0]?.message || "Invalid URL"}
                        </p>
                      )}
                    </div>
                  );
                }}
              </form.Field>

              <form.Field name="default_tag_auto">
            {(field) => (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id={field.name}
                  checked={field.state.value}
                  onCheckedChange={(checked) => {
                    field.handleChange(checked === true);
                    // Clear default_tag when auto is enabled
                    if (checked) {
                      form.setFieldValue("default_tag", "");
                    } else {
                      form.setFieldValue("default_tag", "main");
                    }
                  }}
                />
                <Label
                  htmlFor={field.name}
                  className="text-sm font-normal cursor-pointer"
                >
                  Auto-detect default branch
                </Label>
              </div>
            )}
          </form.Field>

          {!form.state.values.default_tag_auto && (
            <form.Field name="default_tag">
              {(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <div className="space-y-2">
                    <Label htmlFor={field.name}>Default Tag *</Label>
                    <Input
                      id={field.name}
                      value={field.state.value || ""}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      placeholder="main"
                      aria-invalid={isInvalid}
                    />
                    {isInvalid && field.state.meta.errors && (
                      <p className="text-xs text-destructive">
                        {field.state.meta.errors[0]?.message || "Invalid value"}
                      </p>
                    )}
                  </div>
                );
              }}
            </form.Field>
          )}
            </Fragment>
          )}

          <form.Field name="website">
            {(field) => {
              const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
              return (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>Website</Label>
                  <Input
                    id={field.name}
                    type="url"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    placeholder="https://example.com"
                    aria-invalid={isInvalid}
                  />
                  {isInvalid && field.state.meta.errors && (
                    <p className="text-xs text-destructive">
                      {field.state.meta.errors[0]?.message || "Invalid URL"}
                    </p>
                  )}
                </div>
              );
            }}
          </form.Field>

          <form.Field name="docs">
            {(field) => {
              const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
              return (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>Documentation URL</Label>
                  <Input
                    id={field.name}
                    type="url"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    placeholder="https://docs.example.com"
                    aria-invalid={isInvalid}
                  />
                  {isInvalid && field.state.meta.errors && (
                    <p className="text-xs text-destructive">
                      {field.state.meta.errors[0]?.message || "Invalid URL"}
                    </p>
                  )}
                </div>
              );
            }}
          </form.Field>

          <form.Field name="git_browser">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>Git Browser URL</Label>
                <Input
                  id={field.name}
                  type="url"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  placeholder="https://github.com/user/repo"
                />
              </div>
            )}
          </form.Field>

          <form.Field name="logo">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>Logo URL</Label>
                <Input
                  id={field.name}
                  type="url"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  placeholder="https://example.com/logo.png"
                />
              </div>
            )}
          </form.Field>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
