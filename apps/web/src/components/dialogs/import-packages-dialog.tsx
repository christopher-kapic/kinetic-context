import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { orpc, client } from "@/utils/orpc";

interface ImportPackagesDialogProps {
  children: React.ReactNode;
}

// Schema for validating imported package configs (excluding system-specific fields)
const ImportPackageSchema = z.object({
  identifier: z.string().min(1),
  package_manager: z.string(),
  display_name: z.string().min(1),
  storage_type: z.enum(["cloned", "local"]),
  default_tag: z.string().optional(),
  urls: z.object({
    website: z.string().optional(),
    docs: z.string().optional(),
    git_browser: z.string().optional(),
    git: z.string().optional(),
    logo: z.string().optional(),
  }),
});

type ImportPackage = z.infer<typeof ImportPackageSchema>;

interface ImportResult {
  imported: number;
  skipped: number;
  errors: Array<{ identifier: string; error: string }>;
}

export function ImportPackagesDialog({ children }: ImportPackagesDialogProps) {
  const [open, setOpen] = useState(false);
  const [jsonInput, setJsonInput] = useState("");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const queryClient = useQueryClient();

  const createMutation = useMutation(orpc.packages.create.mutationOptions());

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setJsonInput("");
      setImportResult(null);
    }
  };

  const validateJson = (jsonString: string): ImportPackage[] | null => {
    try {
      const parsed = JSON.parse(jsonString);
      if (!Array.isArray(parsed)) {
        toast.error("JSON must be an array of package configurations");
        return null;
      }

      const validated: ImportPackage[] = [];
      for (const item of parsed) {
        const result = ImportPackageSchema.safeParse(item);
        if (!result.success) {
          toast.error(`Invalid package config: ${item.identifier || "unknown"}. ${result.error.message}`);
          return null;
        }
        validated.push(result.data);
      }

      return validated;
    } catch (error) {
      toast.error("Invalid JSON format");
      return null;
    }
  };

  const checkPackageExists = async (identifier: string): Promise<boolean> => {
    try {
      await client.packages.get({ identifier });
      return true;
    } catch (error: any) {
      if (error?.code === "NOT_FOUND") {
        return false;
      }
      // If it's another error, assume it doesn't exist and let create handle it
      return false;
    }
  };

  const handleImport = async () => {
    const packages = validateJson(jsonInput);
    if (!packages) {
      return;
    }

    setIsImporting(true);
    setImportResult(null);

    const result: ImportResult = {
      imported: 0,
      skipped: 0,
      errors: [],
    };

    // Import packages sequentially to avoid overwhelming the server
    for (const pkg of packages) {
      try {
        // Check if package already exists
        const exists = await checkPackageExists(pkg.identifier);
        if (exists) {
          result.skipped++;
          continue;
        }

        // Filter out local storage types that can't be imported
        if (pkg.storage_type === "local") {
          result.errors.push({
            identifier: pkg.identifier,
            error: "Cannot import local packages (system-specific paths required)",
          });
          continue;
        }

        // For cloned packages, ensure git URL is provided
        if (pkg.storage_type === "cloned" && !pkg.urls.git) {
          result.errors.push({
            identifier: pkg.identifier,
            error: "Git URL is required for cloned packages",
          });
          continue;
        }

        // Create the package
        await createMutation.mutateAsync({
          identifier: pkg.identifier,
          package_manager: pkg.package_manager,
          display_name: pkg.display_name,
          storage_type: pkg.storage_type,
          default_tag: pkg.default_tag,
          urls: pkg.urls,
        });

        result.imported++;
      } catch (error: any) {
        result.errors.push({
          identifier: pkg.identifier,
          error: error.message || "Failed to import package",
        });
      }
    }

    setIsImporting(false);
    setImportResult(result);

    // Refresh package list
    queryClient.invalidateQueries({ queryKey: orpc.packages.list.key() });
    queryClient.invalidateQueries({ queryKey: orpc.stats.get.key() });

    // Show summary toast
    if (result.imported > 0) {
      toast.success(`Imported ${result.imported} package(s)`);
    }
    if (result.skipped > 0) {
      toast.info(`Skipped ${result.skipped} existing package(s)`);
    }
    if (result.errors.length > 0) {
      toast.error(`Failed to import ${result.errors.length} package(s)`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Import Packages</DialogTitle>
          <DialogDescription>
            Paste JSON array of package configurations to import. Existing packages will be skipped.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Package JSON</Label>
            <Textarea
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              placeholder='[\n  {\n    "identifier": "@hookform/resolvers",\n    "package_manager": "npm",\n    "display_name": "React Hook Form - Resolvers",\n    "storage_type": "cloned",\n    "default_tag": "master",\n    "urls": {\n      "git": "git@github.com:react-hook-form/resolvers.git"\n    }\n  }\n]'
              className="font-mono text-xs min-h-[300px]"
            />
          </div>

          {importResult && (
            <div className="space-y-2 p-4 border rounded-lg">
              <div className="font-medium text-sm">Import Summary</div>
              <div className="text-sm space-y-1">
                <div className="text-green-600 dark:text-green-400">
                  ✓ Imported: {importResult.imported}
                </div>
                <div className="text-yellow-600 dark:text-yellow-400">
                  ⊘ Skipped: {importResult.skipped}
                </div>
                {importResult.errors.length > 0 && (
                  <div className="text-red-600 dark:text-red-400">
                    ✗ Errors: {importResult.errors.length}
                  </div>
                )}
              </div>
              {importResult.errors.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="text-xs font-medium">Error Details:</div>
                  {importResult.errors.map((err, idx) => (
                    <div key={idx} className="text-xs text-muted-foreground">
                      <span className="font-mono">{err.identifier}</span>: {err.error}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
          <Button onClick={handleImport} disabled={!jsonInput.trim() || isImporting}>
            {isImporting ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Upload className="size-4 mr-2" />
                Import Packages
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
