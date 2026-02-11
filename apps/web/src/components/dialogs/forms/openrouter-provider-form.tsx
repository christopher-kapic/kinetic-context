import { useState, useEffect } from "react";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { orpcClient } from "@/utils/orpc";

const openRouterSchema = z.object({
  providerId: z.string().min(1, "Provider ID is required"),
  apiKey: z.string().min(1, "API key is required"),
  baseURL: z.string().url().optional().or(z.literal("")),
  models: z.string().optional(),
});

type OpenRouterForm = z.infer<typeof openRouterSchema>;

interface OpenRouterProviderFormProps {
  initialData?: any;
  providerId?: string;
  onSave: (providerId: string, config: any) => void;
  onCancel: () => void;
}

export function OpenRouterProviderForm({
  initialData,
  providerId: initialProviderId,
  onSave,
  onCancel,
}: OpenRouterProviderFormProps) {
  // Extract models without the openrouter/ prefix for display
  const getModelsForDisplay = (models: Record<string, any> | undefined): string => {
    if (!models) return "anthropic/claude-3.5-sonnet\nanthropic/claude-3-opus";
    return Object.keys(models)
      .map((id) => id.replace(/^openrouter\//, ""))
      .join("\n");
  };

  const [modelsText, setModelsText] = useState(
    getModelsForDisplay(initialData?.models)
  );
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  const form = useForm<OpenRouterForm>({
    defaultValues: {
      providerId: initialProviderId || "openrouter",
      apiKey: initialData?.options?.apiKey || "",
      baseURL: initialData?.options?.baseURL || "https://openrouter.ai/api/v1",
      models: modelsText,
    },
    validators: {
      onChange: openRouterSchema,
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
        // Remove openrouter/ prefix if user included it - store as raw OpenRouter model ID
        // The model key should be the raw OpenRouter model ID (e.g., "anthropic/claude-3.5-sonnet")
        // The provider prefix will be added when selecting the model, not when storing
        const cleanModelId = modelId.replace(/^openrouter\//, "");
        models[cleanModelId] = {
          name: cleanModelId.split("/").pop() || cleanModelId,
        };
      }

      const config = {
        npm: "@openrouter/ai-sdk-provider",
        name: "OpenRouter",
        options: {
          baseURL: value.baseURL || "https://openrouter.ai/api/v1",
          apiKey: value.apiKey,
        },
        models,
      };

      onSave(value.providerId, config);
    },
  });

  const fetchModels = async () => {
    const currentValues = form.state.values;
    const baseURL = currentValues.baseURL || "https://openrouter.ai/api/v1";

    setIsLoadingModels(true);
    try {
      const result = await orpcClient.config.fetchOpenrouterModels({
        baseURL: baseURL !== "https://openrouter.ai/api/v1" ? baseURL : undefined,
      });

      if (result.models && Array.isArray(result.models) && result.models.length > 0) {
        const modelIds = result.models.map((model) => model.id).join("\n");
        setModelsText(modelIds);
        form.setFieldValue("models", modelIds);
        toast.success(`Loaded ${result.models.length} models`);
      } else {
        throw new Error("No models found");
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to fetch models");
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
    form.setFieldValue("baseURL", initialData?.options?.baseURL || "https://openrouter.ai/api/v1");
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
                placeholder="openrouter"
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
                placeholder="sk-or-v1-..."
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
                  href="https://openrouter.ai/settings/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  OpenRouter dashboard
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
                placeholder="https://openrouter.ai/api/v1"
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
            disabled={isLoadingModels}
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
          placeholder="anthropic/claude-3.5-sonnet&#10;anthropic/claude-3-opus&#10;minimax/minimax-m2.1"
          rows={6}
        />
        <p className="text-xs text-muted-foreground">
          Enter model IDs, one per line. Format: provider/model-name (e.g., anthropic/claude-3.5-sonnet)
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
