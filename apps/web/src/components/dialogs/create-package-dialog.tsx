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
  storage_type: z.enum(["cloned", "local"]),
  repo_path: z.string().optional(), // Only required for local repos
  default_tag_auto: z.boolean(),
  default_tag: z.string().optional(),
  git: z.string().url("Git URL must be a valid URL").optional().or(z.literal("")),
  website: z.string().url().optional().or(z.literal("")),
  docs: z.string().url().optional().or(z.literal("")),
  git_browser: z.string().url().optional().or(z.literal("")),
  logo: z.string().url().optional().or(z.literal("")),
}).superRefine((data, ctx) => {
  // For cloned repos, git URL is required
  if (data.storage_type === "cloned" && !data.git) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Git URL is required for cloned repositories",
      path: ["git"],
    });
  }
  // For local repos, repo_path is required
  if (data.storage_type === "local" && !data.repo_path) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Repository path is required for local repositories",
      path: ["repo_path"],
    });
  }
  // For cloned repos, if auto is not selected, default_tag is required
  if (data.storage_type === "cloned" && !data.default_tag_auto && !data.default_tag) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Default tag is required when auto-detect is disabled",
      path: ["default_tag"],
    });
  }
});

type CreatePackageForm = z.infer<typeof createPackageSchema>;

export type PrefillFromScan = {
  path: string;
  suggestedIdentifier: string;
};

interface CreatePackageDialogProps {
  children?: React.ReactNode;
  onSuccess?: () => void;
  onCancel?: () => void;
  /** When opening from "Scan Projects", prefill form with this repo. Implies storage_type local. */
  prefillFromScan?: PrefillFromScan | null;
  /** Controlled open state (e.g. when used from scan dialog). When set, children are not used as trigger. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function CreatePackageDialog({
  children,
  onSuccess,
  onCancel,
  prefillFromScan,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: CreatePackageDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [identifierState, setIdentifierState] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const isControlled = controlledOpen !== undefined && controlledOnOpenChange !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? controlledOnOpenChange! : setInternalOpen;

  const mutation = useMutation(
    orpc.packages.create.mutationOptions({
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: orpc.packages.list.key() });
        queryClient.invalidateQueries({ queryKey: orpc.stats.get.key() });
        toast.success("Package created successfully");
        setIdentifierState(data.identifier);
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
      input: { identifier: identifierState! },
    }),
    enabled: !!identifierState,
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
      default_tag_auto: true,
      default_tag: "",
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
        // Only send repo_path for local repos (backend calculates it for cloned repos)
        repo_path: value.storage_type === "local" ? value.repo_path : undefined,
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

  // When opening from scan prefill, show local UI immediately (avoid flash of Git URL)
  const effectiveStorageType =
    open && prefillFromScan ? "local" : form.state.values.storage_type;

  // When dialog opens with prefillFromScan, set form to local + path + identifier/display name
  useEffect(() => {
    if (!open) {
      setIdentifierState(null);
      return;
    }
    if (prefillFromScan) {
      const dirName = prefillFromScan.suggestedIdentifier;
      form.setFieldValue("storage_type", "local");
      form.setFieldValue("repo_path", prefillFromScan.path);
      form.setFieldValue("identifier", dirName.toLowerCase());
      form.setFieldValue("display_name", dirName);
      form.setFieldValue("git", "");
      form.setFieldValue("default_tag_auto", false);
      form.setFieldValue("default_tag", "");
    }
  }, [open, prefillFromScan]);

  const handleCancel = () => {
    setOpen(false);
    onCancel?.();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(newOpen) => {
        setOpen(newOpen);
        if (!newOpen) {
          handleCancel();
        }
      }}
    >
      {!isControlled && children ? <DialogTrigger asChild>{children}</DialogTrigger> : null}
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create Package</DialogTitle>
          <DialogDescription>
            Create a new package configuration. Choose to clone a repository or use an existing one.
          </DialogDescription>
        </DialogHeader>
        {identifierState && cloneStatus.data?.status && (
          <div className="p-3 bg-muted rounded-none text-sm">
            Clone status: {cloneStatus.data.status}
            {cloneStatus.data.status === "cloning" && " (this may take a while...)"}
          </div>
        )}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            e.stopPropagation();
            await form.handleSubmit();
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
                      field.handleChange(value as "cloned" | "local");
                      // Reset repo_path when switching types
                      form.setFieldValue("repo_path", "");
                      if (value === "local") {
                        form.setFieldValue("git", "");
                        form.setFieldValue("default_tag_auto", false);
                        form.setFieldValue("default_tag", "");
                      } else {
                        form.setFieldValue("default_tag_auto", true);
                        form.setFieldValue("default_tag", "");
                      }
                    }}
                  >
                    <SelectTrigger id={field.name} aria-invalid={isInvalid}>
                      <SelectValue placeholder="Select storage type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cloned">Clone Repository</SelectItem>
                      <SelectItem value="local">Local Repository</SelectItem>
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

          {effectiveStorageType === "local" ? (
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
                    {prefillFromScan && (
                      <p className="text-xs text-muted-foreground font-mono break-all" title={prefillFromScan.path}>
                        Full path: {prefillFromScan.path}
                      </p>
                    )}
                    {!prefillFromScan && (
                      <p className="text-xs text-muted-foreground">
                        Absolute path to an existing git repository on your machine
                      </p>
                    )}
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
