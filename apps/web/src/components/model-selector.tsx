import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Model {
  providerId: string;
  modelId: string;
  displayName: string;
}

interface ModelSelectorProps {
  models: Model[];
  selectedModel: string | undefined;
  onModelChange: (model: string) => void;
  isLoading?: boolean;
}

export function ModelSelector({ models, selectedModel, onModelChange, isLoading }: ModelSelectorProps) {
  const modelValue = selectedModel || (models.length > 0 ? `${models[0].providerId}/${models[0].modelId}` : undefined);

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm font-medium whitespace-nowrap">Model:</label>
      <Select
        value={modelValue}
        onValueChange={onModelChange}
        disabled={isLoading || models.length === 0}
      >
        <SelectTrigger className="w-[300px]">
          <SelectValue placeholder={isLoading ? "Loading models..." : "Select a model"} />
        </SelectTrigger>
        <SelectContent>
          {models.map((model) => {
            const value = `${model.providerId}/${model.modelId}`;
            return (
              <SelectItem key={value} value={value}>
                {model.displayName}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}
