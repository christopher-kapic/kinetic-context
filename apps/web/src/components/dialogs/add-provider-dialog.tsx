import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { orpc } from "@/utils/orpc";
import { getSafeProvider } from "@/utils/config";
import { OpenRouterProviderForm } from "./forms/openrouter-provider-form";
import { GitHubCopilotProviderForm } from "./forms/github-copilot-provider-form";
import { CustomProviderForm } from "./forms/custom-provider-form";
import { OpenCodeZenProviderForm } from "./forms/opencode-zen-provider-form";

type ProviderType = "openrouter" | "github-copilot" | "opencode-zen" | "custom";

interface AddProviderDialogProps {
  children: React.ReactNode;
}

export function AddProviderDialog({ children }: AddProviderDialogProps) {
  const [open, setOpen] = useState(false);
  const [providerType, setProviderType] = useState<ProviderType | null>(null);
  const queryClient = useQueryClient();
  const config = useQuery(orpc.config.get.queryOptions());

  const updateMutation = useMutation(
    orpc.config.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.config.get.key() });
        toast.success("Provider added successfully");
        setOpen(false);
        setProviderType(null);
      },
      onError: (error: any) => {
        toast.error(error.message || "Failed to add provider");
      },
    })
  );

  const handleProviderAdded = (providerId: string, providerConfig: any) => {
    if (!config.data) return;

    // Validate providerConfig is a valid object
    if (!providerConfig || typeof providerConfig !== 'object' || Array.isArray(providerConfig)) {
      toast.error("Invalid provider configuration");
      return;
    }

    const safeProvider = getSafeProvider(config.data.provider);

    const updatedConfig = {
      ...config.data,
      provider: {
        ...safeProvider,
        [providerId]: providerConfig,
      },
    };

    console.log('[add-provider] Sending config with provider:', {
      providerId,
      hasProvider: !!updatedConfig.provider,
      providerKeys: Object.keys(updatedConfig.provider || {}),
      providerConfigKeys: Object.keys(providerConfig),
    });

    updateMutation.mutate({ config: updatedConfig });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Provider</DialogTitle>
          <DialogDescription>
            Add a new AI model provider to your configuration
          </DialogDescription>
        </DialogHeader>

        {!providerType ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Provider Type</Label>
              <Select
                value={providerType || undefined}
                onValueChange={(value) => setProviderType(value as ProviderType)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a provider type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openrouter">OpenRouter</SelectItem>
                  <SelectItem value="opencode-zen">OpenCode Zen</SelectItem>
                  <SelectItem value="github-copilot">GitHub Copilot</SelectItem>
                  <SelectItem value="custom">Custom Provider</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <Button
              variant="ghost"
              onClick={() => setProviderType(null)}
              className="mb-2"
            >
              ← Back to provider selection
            </Button>

            {providerType === "openrouter" && (
              <OpenRouterProviderForm
                onSave={handleProviderAdded}
                onCancel={() => setProviderType(null)}
              />
            )}

            {providerType === "opencode-zen" && (
              <OpenCodeZenProviderForm
                onSave={handleProviderAdded}
                onCancel={() => setProviderType(null)}
              />
            )}

            {providerType === "github-copilot" && (
              <GitHubCopilotProviderForm
                onSave={handleProviderAdded}
                onCancel={() => setProviderType(null)}
              />
            )}

            {providerType === "custom" && (
              <CustomProviderForm
                onSave={handleProviderAdded}
                onCancel={() => setProviderType(null)}
              />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
