import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Copy, Check } from "lucide-react";
import { toast } from "sonner";

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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { orpc } from "@/utils/orpc";

interface ExportPackagesDialogProps {
  children: React.ReactNode;
}

export function ExportPackagesDialog({ children }: ExportPackagesDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedIdentifiers, setSelectedIdentifiers] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const packages = useQuery(orpc.packages.list.queryOptions());

  // Filter out packages with local/existing storage types (they have system-specific paths)
  const exportablePackages = useMemo(() => {
    if (!packages.data) return [];
    return packages.data.filter((pkg) => pkg.storage_type === "cloned");
  }, [packages.data]);

  // Initialize selection when dialog opens
  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (newOpen) {
      // Select all exportable packages by default
      setSelectedIdentifiers(new Set(exportablePackages.map((pkg) => pkg.identifier)));
    } else {
      setSelectedIdentifiers(new Set());
      setCopied(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIdentifiers.size === exportablePackages.length) {
      setSelectedIdentifiers(new Set());
    } else {
      setSelectedIdentifiers(new Set(exportablePackages.map((pkg) => pkg.identifier)));
    }
  };

  const togglePackage = (identifier: string) => {
    const newSet = new Set(selectedIdentifiers);
    if (newSet.has(identifier)) {
      newSet.delete(identifier);
    } else {
      newSet.add(identifier);
    }
    setSelectedIdentifiers(newSet);
  };

  // Generate JSON from selected packages
  const exportJson = useMemo(() => {
    if (selectedIdentifiers.size === 0) return "[]";

    const selectedPackages = exportablePackages.filter((pkg) =>
      selectedIdentifiers.has(pkg.identifier)
    );

    const exportData = selectedPackages.map((pkg) => {
      // Exclude system-specific fields: repo_path and cloneStatus
      const { repo_path, cloneStatus, ...exportPackage } = pkg;
      return exportPackage;
    });

    return JSON.stringify(exportData, null, 2);
  }, [selectedIdentifiers, exportablePackages]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(exportJson);
      setCopied(true);
      toast.success("Copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error("Failed to copy to clipboard");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Export Packages</DialogTitle>
          <DialogDescription>
            Select packages to export. Only "cloned" packages can be exported (local/existing packages
            have system-specific paths).
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          {packages.isLoading ? (
            <div className="py-8 text-center">
              <p className="text-muted-foreground">Loading packages...</p>
            </div>
          ) : exportablePackages.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-muted-foreground">
                No exportable packages found. Only "cloned" packages can be exported.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">
                  Select packages ({selectedIdentifiers.size} of {exportablePackages.length} selected)
                </Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleSelectAll}
                  className="h-8"
                >
                  {selectedIdentifiers.size === exportablePackages.length
                    ? "Deselect All"
                    : "Select All"}
                </Button>
              </div>

              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {exportablePackages.map((pkg) => (
                  <Card key={pkg.identifier}>
                    <CardContent className="p-3">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={pkg.identifier}
                          checked={selectedIdentifiers.has(pkg.identifier)}
                          onCheckedChange={() => togglePackage(pkg.identifier)}
                        />
                        <Label
                          htmlFor={pkg.identifier}
                          className="flex-1 cursor-pointer text-sm"
                        >
                          <div className="font-medium">{pkg.display_name}</div>
                          <div className="text-xs text-muted-foreground">{pkg.identifier}</div>
                        </Label>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Export JSON</Label>
                <Textarea
                  value={exportJson}
                  readOnly
                  className="font-mono text-xs min-h-[200px]"
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
          <Button onClick={handleCopy} disabled={selectedIdentifiers.size === 0}>
            {copied ? (
              <>
                <Check className="size-4 mr-2" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="size-4 mr-2" />
                Copy to Clipboard
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
