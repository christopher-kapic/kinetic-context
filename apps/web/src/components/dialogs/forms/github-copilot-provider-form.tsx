import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";

const githubCopilotSchema = z.object({
  providerId: z.string().min(1, "Provider ID is required"),
  enterpriseUrl: z.string().url().optional().or(z.literal("")),
});

type GitHubCopilotForm = z.infer<typeof githubCopilotSchema>;

interface GitHubCopilotProviderFormProps {
  initialData?: any;
  providerId?: string;
  onSave: (providerId: string, config: any) => void;
  onCancel: () => void;
}

export function GitHubCopilotProviderForm({
  initialData,
  providerId: initialProviderId,
  onSave,
  onCancel,
}: GitHubCopilotProviderFormProps) {
  const form = useForm<GitHubCopilotForm>({
    defaultValues: {
      providerId: initialProviderId || "github-copilot",
      enterpriseUrl: initialData?.options?.enterpriseUrl || "",
    },
    validators: {
      onChange: githubCopilotSchema,
    },
    onSubmit: async ({ value }) => {
      const config: any = {
        npm: "@ai-sdk/github-copilot",
        name: "GitHub Copilot",
      };

      if (value.enterpriseUrl) {
        config.options = {
          enterpriseUrl: value.enterpriseUrl,
        };
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
      <Alert>
        <Info className="size-4" />
        <AlertDescription>
          GitHub Copilot authentication is handled via the <code>/connect</code> command in
          OpenCode. You only need to configure the provider here. For GitHub Copilot Enterprise,
          provide your enterprise URL below.
        </AlertDescription>
      </Alert>

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
                placeholder="github-copilot"
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

      <form.Field name="enterpriseUrl">
        {(field) => {
          const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
          return (
            <div className="space-y-2">
              <Label htmlFor={field.name}>Enterprise URL (optional)</Label>
              <Input
                id={field.name}
                type="url"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                placeholder="https://github.example.com"
                aria-invalid={isInvalid}
              />
              {isInvalid && field.state.meta.errors && (
                <p className="text-xs text-destructive">
                  {field.state.meta.errors[0]?.message || "Invalid URL"}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Only required for GitHub Copilot Enterprise. Leave empty for regular GitHub Copilot.
              </p>
            </div>
          );
        }}
      </form.Field>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Save Provider</Button>
      </div>
    </form>
  );
}
