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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { orpc } from "@/utils/orpc";

const createProjectSchema = z.object({
  identifier: z.string().min(1, "Identifier is required"),
  display_name: z.string().min(1, "Display name is required"),
  website: z.string().url().optional().or(z.literal("")),
  git_browser: z.string().url().optional().or(z.literal("")),
  git: z.string().url().optional().or(z.literal("")),
  logo: z.string().url().optional().or(z.literal("")),
});

type CreateProjectForm = z.infer<typeof createProjectSchema>;

interface CreateProjectDialogProps {
  children: React.ReactNode;
}

export function CreateProjectDialog({ children }: CreateProjectDialogProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const mutation = useMutation(
    orpc.projects.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.projects.list.key() });
        queryClient.invalidateQueries({ queryKey: orpc.stats.get.key() });
        toast.success("Project created successfully");
        setOpen(false);
        form.reset();
      },
      onError: (error: any) => {
        toast.error(error.message || "Failed to create project");
      },
    })
  );

  const form = useForm<CreateProjectForm>({
    defaultValues: {
      identifier: "",
      display_name: "",
      website: "",
      git_browser: "",
      git: "",
      logo: "",
    },
    validators: {
      onChange: createProjectSchema,
    },
    onSubmit: async ({ value }) => {
      mutation.mutate({
        identifier: value.identifier,
        display_name: value.display_name,
        urls: {
          website: value.website || undefined,
          git_browser: value.git_browser || undefined,
          git: value.git || undefined,
          logo: value.logo || undefined,
        },
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create Project</DialogTitle>
          <DialogDescription>
            Create a new project configuration. The identifier must be unique.
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
          <form.Field
            name="identifier"
          >
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
                    placeholder="my-project"
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

          <form.Field
            name="display_name"
          >
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
                    placeholder="My Project"
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

          <form.Field name="git">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>Git URL</Label>
                <Input
                  id={field.name}
                  type="url"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  placeholder="https://github.com/user/repo.git"
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
              onClick={() => setOpen(false)}
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
