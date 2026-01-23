import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Settings } from "lucide-react";

export const Route = createFileRoute("/settings")({
  component: SettingsComponent,
});

const settingsSchema = z.object({
  default_packages_dir: z.string().min(1, "Default packages directory is required"),
  default_agent_prompt: z.string().optional(),
});

type SettingsForm = z.infer<typeof settingsSchema>;

function SettingsComponent() {
  const queryClient = useQueryClient();
  const settings = useQuery(orpc.config.getSettings.queryOptions());

  const updateMutation = useMutation(
    orpc.config.updateSettings.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.config.getSettings.key() });
        toast.success("Settings updated successfully");
      },
      onError: (error: any) => {
        toast.error(error.message || "Failed to update settings");
      },
    })
  );

  const form = useForm<SettingsForm>({
    defaultValues: {
      default_packages_dir: settings.data?.default_packages_dir || "/data/packages",
      default_agent_prompt: settings.data?.default_agent_prompt || "",
    },
    validators: {
      onChange: settingsSchema,
    },
    onSubmit: async ({ value }) => {
      updateMutation.mutate({
        default_packages_dir: value.default_packages_dir,
        default_agent_prompt: value.default_agent_prompt || undefined,
      });
    },
  });

  // Update form when settings load
  if (settings.data) {
    if (form.state.values.default_packages_dir !== settings.data.default_packages_dir) {
      form.setFieldValue("default_packages_dir", settings.data.default_packages_dir);
    }
    if (form.state.values.default_agent_prompt !== (settings.data.default_agent_prompt || "")) {
      form.setFieldValue("default_agent_prompt", settings.data.default_agent_prompt || "");
    }
  }

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6 sm:py-8">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
          <Settings className="size-6 sm:size-7" />
          Settings
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">
          Configure global settings for kinetic-context
        </p>
      </div>

      {settings.isLoading ? (
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-48 mt-2" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Settings</CardTitle>
            <CardDescription>
              Configure global settings for kinetic-context
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                form.handleSubmit();
              }}
              className="space-y-6"
            >
              <form.Field name="default_packages_dir">
                {(field) => {
                  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                  return (
                    <div className="space-y-2">
                      <Label htmlFor={field.name}>Default Packages Directory *</Label>
                      <Input
                        id={field.name}
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        onBlur={field.handleBlur}
                        placeholder="/data/packages"
                        aria-invalid={isInvalid}
                      />
                      <p className="text-xs text-muted-foreground">
                        Default directory where cloned repositories will be stored. Use absolute paths.
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

              <form.Field name="default_agent_prompt">
                {(field) => {
                  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                  const hasCustomPrompt = field.state.value && field.state.value.trim().length > 0;
                  return (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor={field.name}>Default Agent Prompt</Label>
                        {hasCustomPrompt && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              field.handleChange("");
                              // Auto-save when resetting
                              const currentValues = form.state.values;
                              updateMutation.mutate({
                                default_packages_dir: currentValues.default_packages_dir,
                                default_agent_prompt: undefined,
                              });
                            }}
                            disabled={updateMutation.isPending}
                          >
                            Reset to Default
                          </Button>
                        )}
                      </div>
                      <Textarea
                        id={field.name}
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        onBlur={field.handleBlur}
                        placeholder="You are a helpful assistant specialized in answering questions about open-source codebases and dependencies..."
                        aria-invalid={isInvalid}
                        rows={10}
                        className="font-mono text-sm"
                      />
                      <p className="text-xs text-muted-foreground">
                        This prompt is sent as a system message at the start of each new OpenCode session. It guides how the AI responds to questions about dependencies. Leave empty to use the default prompt.
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

              <div className="flex justify-end">
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? "Saving..." : "Save Settings"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
