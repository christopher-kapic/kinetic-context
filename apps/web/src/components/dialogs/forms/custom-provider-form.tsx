import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const customProviderSchema = z.object({
  providerId: z.string().min(1, "Provider ID is required"),
  npm: z.string().min(1, "NPM package is required"),
  name: z.string().min(1, "Display name is required"),
  baseURL: z.string().url().optional().or(z.literal("")),
  apiKey: z.string().optional(),
  models: z.string().optional(),
});

type CustomProviderForm = z.infer<typeof customProviderSchema>;

interface CustomProviderFormProps {
  initialData?: any;
  providerId?: string;
  onSave: (providerId: string, config: any) => void;
  onCancel: () => void;
}

export function CustomProviderForm({
  initialData,
  providerId: initialProviderId,
  onSave,
  onCancel,
}: CustomProviderFormProps) {
  const [modelsText, setModelsText] = useState(
    initialData?.models
      ? Object.entries(initialData.models)
          .map(([id, config]: [string, any]) => `${id}: ${config.name || ""}`)
          .join("\n")
      : ""
  );

  const form = useForm<CustomProviderForm>({
    defaultValues: {
      providerId: initialProviderId || "",
      npm: initialData?.npm || "",
      name: initialData?.name || "",
      baseURL: initialData?.options?.baseURL || "",
      apiKey: initialData?.options?.apiKey || "",
      models: modelsText,
    },
    validators: {
      onChange: customProviderSchema,
    },
    onSubmit: async ({ value }) => {
      // Parse models from text (format: modelId: displayName)
      const models: Record<string, any> = {};
      if (value.models) {
        const lines = value.models.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
        for (const line of lines) {
          if (line.includes(":")) {
            const [modelId, ...nameParts] = line.split(":");
            const name = nameParts.join(":").trim();
            models[modelId.trim()] = name ? { name } : {};
          } else {
            models[line] = {};
          }
        }
      }

      const config: any = {
        npm: value.npm,
        name: value.name,
      };

      const options: any = {};
      if (value.baseURL) {
        options.baseURL = value.baseURL;
      }
      if (value.apiKey) {
        options.apiKey = value.apiKey;
      }

      if (Object.keys(options).length > 0) {
        config.options = options;
      }

      if (Object.keys(models).length > 0) {
        config.models = models;
      }

      onSave(value.providerId, config);
    },
  });

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
                placeholder="my-provider"
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

      <form.Field name="npm">
        {(field) => {
          const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
          return (
            <div className="space-y-2">
              <Label htmlFor={field.name}>NPM Package *</Label>
              <Input
                id={field.name}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                placeholder="@ai-sdk/openai-compatible"
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

      <form.Field name="name">
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
                placeholder="My AI Provider"
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

      <form.Field name="baseURL">
        {(field) => {
          const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
          return (
            <div className="space-y-2">
              <Label htmlFor={field.name}>Base URL (optional)</Label>
              <Input
                id={field.name}
                type="url"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                placeholder="https://api.example.com/v1"
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

      <form.Field name="apiKey">
        {(field) => {
          return (
            <div className="space-y-2">
              <Label htmlFor={field.name}>API Key (optional)</Label>
              <Input
                id={field.name}
                type="password"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                placeholder="sk-..."
              />
              <p className="text-xs text-muted-foreground">
                You can also set API keys via the <code>/connect</code> command in OpenCode
              </p>
            </div>
          );
        }}
      </form.Field>

      <div className="space-y-2">
        <Label htmlFor="models">Models (optional, one per line)</Label>
        <Textarea
          id="models"
          value={modelsText}
          onChange={(e) => {
            setModelsText(e.target.value);
            form.setFieldValue("models", e.target.value);
          }}
          placeholder="model-id-1: Display Name 1&#10;model-id-2: Display Name 2"
          rows={6}
        />
        <p className="text-xs text-muted-foreground">
          Enter model IDs, one per line. Format: modelId: Display Name (name is optional)
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
