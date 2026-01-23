import { useState, useEffect } from "react";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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
  // Extract models without the opencode/ prefix for display
  const getModelsForDisplay = (models: Record<string, any> | undefined): string => {
    if (!models) return "opencode/gpt-5.2-codex\nopencode/claude-sonnet-4-5";
    return Object.keys(models)
      .map((id) => id.replace(/^opencode\//, ""))
      .join("\n");
  };

  const [modelsText, setModelsText] = useState(
    getModelsForDisplay(initialData?.models)
  );

  const form = useForm<OpenCodeZenForm>({
    defaultValues: {
      providerId: initialProviderId || "opencode-zen",
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
        // Ensure opencode/ prefix is present - store with prefix
        // The model key should include the opencode/ prefix (e.g., "opencode/gpt-5.2-codex")
        const modelIdWithPrefix = modelId.startsWith("opencode/")
          ? modelId
          : `opencode/${modelId}`;
        models[modelIdWithPrefix] = {
          name: modelIdWithPrefix.split("/").pop() || modelIdWithPrefix,
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
                placeholder="opencode-zen"
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
        <Label htmlFor="models">Models (one per line)</Label>
        <Textarea
          id="models"
          value={modelsText}
          onChange={(e) => {
            setModelsText(e.target.value);
            form.setFieldValue("models", e.target.value);
          }}
          placeholder="opencode/gpt-5.2-codex&#10;opencode/claude-sonnet-4-5&#10;opencode/kimi-k2"
          rows={6}
        />
        <p className="text-xs text-muted-foreground">
          Enter model IDs, one per line. Format: opencode/model-name (e.g., opencode/gpt-5.2-codex). The opencode/ prefix will be added automatically if omitted.
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
