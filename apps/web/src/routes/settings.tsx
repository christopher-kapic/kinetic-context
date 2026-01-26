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
  default_agent_prompt: z.string().optional(),
});

type SettingsForm = z.infer<typeof settingsSchema>;

function SettingsComponent() {
  const queryClient = useQueryClient();
  const settings = useQuery(orpc.config.getSettings.queryOptions());
  const opencodeConfig = useQuery(orpc.config.get.queryOptions());

  const updateSettingsMutation = useMutation(
    orpc.config.updateSettings.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.config.getSettings.key() });
      },
      onError: (error: any) => {
        toast.error(error.message || "Failed to update settings");
      },
    })
  );

  const updateConfigMutation = useMutation(
    orpc.config.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.config.get.key() });
        toast.success("Settings updated successfully");
      },
      onError: (error: any) => {
        toast.error(error.message || "Failed to update configuration");
      },
    })
  );

  // Extract agent prompt, handling both string and object formats
  let agentPrompt = "";
  if (opencodeConfig.data?.agent) {
    if (typeof opencodeConfig.data.agent === "string") {
      agentPrompt = opencodeConfig.data.agent;
    } else if (typeof opencodeConfig.data.agent === "object" && opencodeConfig.data.agent.default?.prompt) {
      agentPrompt = opencodeConfig.data.agent.default.prompt;
    }
  }
  // Fall back to global settings if no agent prompt found
  if (!agentPrompt) {
    agentPrompt = settings.data?.default_agent_prompt || "";
  }

  const form = useForm<SettingsForm>({
    defaultValues: {
      default_agent_prompt: agentPrompt,
    },
    validators: {
      onChange: settingsSchema,
    },
    onSubmit: async ({ value }) => {
      // Update global settings (remove default_agent_prompt from global config, store in opencode.json instead)
      updateSettingsMutation.mutate({
        default_agent_prompt: undefined,
      });

      // Update opencode.json with agent prompt
      const currentConfig = opencodeConfig.data || { $schema: "https://opencode.ai/config.json", provider: {} };
      const updatedConfig = { ...currentConfig };
      
      // Handle agent prompt - save to agent.default.prompt structure
      if (value.default_agent_prompt && typeof value.default_agent_prompt === 'string' && value.default_agent_prompt.trim().length > 0) {
        // Ensure agent object exists
        if (!updatedConfig.agent || typeof updatedConfig.agent !== "object") {
          updatedConfig.agent = {};
        }
        // Ensure default agent exists
        if (!updatedConfig.agent.default || typeof updatedConfig.agent.default !== "object") {
          updatedConfig.agent.default = {
            mode: "primary",
            tools: {
              write: false,
              edit: false,
              bash: false,
            },
          };
        }
        // Update the prompt
        updatedConfig.agent.default.prompt = value.default_agent_prompt;
      } else {
        // Remove agent prompt if empty, but keep agent structure if it exists
        if (updatedConfig.agent && typeof updatedConfig.agent === "object" && updatedConfig.agent.default) {
          delete updatedConfig.agent.default.prompt;
          // If default agent has no other properties except mode and tools, we could remove it,
          // but we'll keep the structure to maintain consistency
        }
      }
      
      updateConfigMutation.mutate({ config: updatedConfig });
    },
  });

  // Update form when settings or config load
  if (settings.data || opencodeConfig.data) {
    const currentAgentPrompt = agentPrompt;
    if (form.state.values.default_agent_prompt !== currentAgentPrompt) {
      form.setFieldValue("default_agent_prompt", currentAgentPrompt);
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

      {settings.isLoading || opencodeConfig.isLoading ? (
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
              <form.Field name="default_agent_prompt">
                {(field) => {
                  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                  const fieldValue = field.state.value ?? "";
                  const hasCustomPrompt = typeof fieldValue === 'string' && fieldValue.trim().length > 0;
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
                              updateSettingsMutation.mutate({
                                default_agent_prompt: undefined,
                              });
                              // Remove agent prompt from opencode.json
                              const currentConfig = opencodeConfig.data || { $schema: "https://opencode.ai/config.json", provider: {} };
                              const updatedConfig = { ...currentConfig };
                              // Remove prompt from agent.default if it exists
                              if (updatedConfig.agent && typeof updatedConfig.agent === "object" && updatedConfig.agent.default) {
                                delete updatedConfig.agent.default.prompt;
                              }
                              updateConfigMutation.mutate({ config: updatedConfig });
                            }}
                            disabled={updateSettingsMutation.isPending || updateConfigMutation.isPending}
                          >
                            Reset to Default
                          </Button>
                        )}
                      </div>
                      <Textarea
                        id={field.name}
                        value={fieldValue}
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
                <Button type="submit" disabled={updateSettingsMutation.isPending || updateConfigMutation.isPending}>
                  {updateSettingsMutation.isPending || updateConfigMutation.isPending ? "Saving..." : "Save Settings"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
