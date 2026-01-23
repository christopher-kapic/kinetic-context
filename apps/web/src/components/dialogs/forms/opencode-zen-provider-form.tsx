import { useState, useEffect } from "react";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const opencodeZenSchema = z.object({
  providerId: z.string().min(1, "Provider ID is required"),
  apiKey: z.string().min(1, "API key is required"),
  baseURL: z.string().url().optional().or(z.literal("")),
  models: z.string().optional(),
});

type OpenCodeZenForm = z.infer<typeof opencodeZenSchema>;

interface OpenCodeZenProviderFormProps {
  initialData?: any;
  providerId?: string;
  onSave: (providerId: string, config: any) => void;
  onCancel: () => void;
}

export function OpenCodeZenProviderForm({
  initialData,
  providerId: initialProviderId,
  onSave,
  onCancel,
}: OpenCodeZenProviderFormProps) {
  // Extract models for display (models are stored without prefix, like OpenRouter)
  const getModelsForDisplay = (models: Record<string, any> | undefined): string => {
    if (!models) return "gpt-5.2-codex\nclaude-sonnet-4-5";
    return Object.keys(models)
      .map((id) => id.replace(/^opencode\//, "")) // Remove prefix if present (for backward compat)
      .join("\n");
  };

  const [modelsText, setModelsText] = useState(
    getModelsForDisplay(initialData?.models)
  );
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  const form = useForm<OpenCodeZenForm>({
    defaultValues: {
      providerId: initialProviderId || "opencode",
      apiKey: initialData?.options?.apiKey || "",
      baseURL: initialData?.options?.baseURL || "https://opencode.ai/zen/v1",
      models: modelsText,
    },
    validators: {
      onChange: opencodeZenSchema,
    },
    onSubmit: async ({ value }) => {
      // Parse models from text (one per line)
      const modelIds = value.models
        ? value.models
            .split("\n")
            .map((m) => m.trim())
            .filter((m) => m.length > 0)
        : [];

      const models: Record<string, any> = {};
      for (const modelId of modelIds) {
        // Remove opencode/ prefix if user included it - store as raw model ID
        // The model key should be the raw model ID (e.g., "gpt-5.2-codex")
        // The provider prefix will be added when selecting the model, not when storing
        const cleanModelId = modelId.replace(/^opencode\//, "");
        models[cleanModelId] = {
          name: cleanModelId,
        };
      }

      const config = {
        npm: "@ai-sdk/openai-compatible",
        name: "OpenCode Zen",
        options: {
          baseURL: value.baseURL || "https://opencode.ai/zen/v1",
          apiKey: value.apiKey,
        },
        models,
      };

      onSave(value.providerId, config);
    },
  });

  const fetchModels = async () => {
    const currentValues = form.state.values;
    const apiKey = currentValues.apiKey;
    const baseURL = currentValues.baseURL || "https://opencode.ai/zen/v1";

    if (!apiKey) {
      toast.error("Please enter an API key first");
      return;
    }

    setIsLoadingModels(true);
    try {
      const response = await fetch(`${baseURL}/models`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`);
      }

      const data = await response.json();
      if (data.data && Array.isArray(data.data)) {
        const modelIds = data.data.map((model: any) => model.id).join("\n");
        setModelsText(modelIds);
        form.setFieldValue("models", modelIds);
        toast.success(`Loaded ${data.data.length} models`);
      } else {
        throw new Error("Invalid response format");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to fetch models");
    } finally {
      setIsLoadingModels(false);
    }
  };

  // Sync modelsText state and form values when initialData changes
  useEffect(() => {
    const newModelsText = getModelsForDisplay(initialData?.models);
    setModelsText(newModelsText);
    form.setFieldValue("models", newModelsText);
    form.setFieldValue("apiKey", initialData?.options?.apiKey || "");
    form.setFieldValue("baseURL", initialData?.options?.baseURL || "https://opencode.ai/zen/v1");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData?.models, initialData?.options?.apiKey, initialData?.options?.baseURL]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
      className="space-y-4"
    >
      <form.Field name="providerId">
        {(field) => {
          const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
          return (
            <div className="space-y-2">
              <Label htmlFor={field.name}>Provider ID *</Label>
              <Input
                id={field.name}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                placeholder="opencode"
                aria-invalid={isInvalid}
                disabled={!!initialProviderId}
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

      <form.Field name="apiKey">
        {(field) => {
          const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
          return (
            <div className="space-y-2">
              <Label htmlFor={field.name}>API Key *</Label>
              <Input
                id={field.name}
                type="password"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                placeholder="Your OpenCode Zen API key"
                aria-invalid={isInvalid}
              />
              {isInvalid && field.state.meta.errors && (
                <p className="text-xs text-destructive">
                  {field.state.meta.errors[0]?.message || "Invalid value"}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Get your API key from{" "}
                <a
                  href="https://opencode.ai/auth"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  OpenCode auth page
                </a>
              </p>
            </div>
          );
        }}
      </form.Field>

      <form.Field name="baseURL">
        {(field) => {
          const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
          return (
            <div className="space-y-2">
              <Label htmlFor={field.name}>Base URL</Label>
              <Input
                id={field.name}
                type="url"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                placeholder="https://opencode.ai/zen/v1"
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

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="models">Models (one per line)</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={fetchModels}
            disabled={isLoadingModels || !form.state.values.apiKey}
          >
            {isLoadingModels ? (
              <>
                <Loader2 className="size-3 mr-2 animate-spin" />
                Loading...
              </>
            ) : (
              "Fetch Models"
            )}
          </Button>
        </div>
        <Textarea
          id="models"
          value={modelsText}
          onChange={(e) => {
            setModelsText(e.target.value);
            form.setFieldValue("models", e.target.value);
          }}
          placeholder="gpt-5.2-codex&#10;claude-sonnet-4-5&#10;kimi-k2"
          rows={6}
        />
        <p className="text-xs text-muted-foreground">
          Enter model IDs, one per line (e.g., gpt-5.2-codex). Click "Fetch Models" to automatically load all available models from OpenCode Zen.
        </p>
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Save Provider</Button>
      </div>
    </form>
  );
}
