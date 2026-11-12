import { Trans, useLingui } from "@lingui/react/macro";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@rakazo/ui-web";
import { AlertCircle, ChevronRight, Folder, FolderUp, HardDrive, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

export function FolderBrowserModal({
  open,
  initialPath,
  onClose,
  onSelect,
}: {
  open: boolean;
  initialPath?: string;
  onClose: () => void;
  onSelect: (path: string) => void;
}) {
  const { t } = useLingui();
  const [currentPath, setCurrentPath] = useState(initialPath || "");
  const [selectedPath, setSelectedPath] = useState(initialPath || "");
  const [drives, setDrives] = useState<string[]>([]);
  const [directories, setDirectories] = useState<Array<{ name: string; path: string }>>([]);
  const [parent, setParent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadPath(targetPath: string) {
    setLoading(true);
    setError(null);
    try {
      const url = targetPath
        ? `/api/fs/list?path=${encodeURIComponent(targetPath)}`
        : "/api/fs/list";
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(t`Failed to load directory`);
      }
      const data = (await res.json()) as {
        ok: boolean;
        drives: string[];
        current: string;
        parent: string | null;
        directories: Array<{ name: string; path: string }>;
        error?: string;
      };
      if (data.error) {
        setError(data.error);
      }
      setDrives(data.drives || []);
      setCurrentPath(data.current || "");
      setParent(data.parent || null);
      setDirectories(data.directories || []);
      if (data.current) {
        setSelectedPath(data.current);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t`Failed to load directory`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) {
      void loadPath(initialPath || "");
    }
  }, [open, initialPath]);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent size="md" className="p-5 flex flex-col gap-3.5">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Folder size={18} className="text-primary" />
            <Trans>Select Project Directory</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>Choose a folder on your computer to mount into this Space.</Trans>
          </DialogDescription>
        </DialogHeader>

        {/* Drives Quick Switch */}
        {drives.length > 0 ? (
          <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
            <span className="flex items-center gap-1 text-label text-muted-foreground me-1">
              <HardDrive size={13} />
              <Trans>Drives:</Trans>
            </span>
            {drives.map((d) => (
              <Button
                key={d}
                size="xs"
                variant={
                  currentPath.toLowerCase().startsWith(d.toLowerCase()) ? "secondary" : "outline"
                }
                onClick={() => void loadPath(`${d}\\`)}
              >
                {d}\
              </Button>
            ))}
          </div>
        ) : null}

        {/* Navigation & Current Path Bar */}
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/60 px-2.5 py-1.5 text-body-sm">
          <Button
            size="icon-xs"
            variant="ghost"
            disabled={parent === null || loading}
            onClick={() => void loadPath(parent ?? "")}
            aria-label={t`Go to parent directory`}
          >
            <FolderUp size={14} />
          </Button>
          <span
            className="min-w-0 flex-1 truncate font-mono text-label text-foreground/90 select-all"
            title={currentPath}
          >
            {currentPath || <Trans>Root (Drives)</Trans>}
          </span>
          <Button
            size="icon-xs"
            variant="ghost"
            disabled={loading}
            onClick={() => void loadPath(currentPath)}
            aria-label={t`Refresh directory`}
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          </Button>
        </div>

        {error ? (
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-2.5 text-body-sm text-destructive">
            <AlertCircle size={15} className="shrink-0" />
            <span className="truncate">{error}</span>
          </div>
        ) : null}

        {/* Directory List View */}
        <div className="h-64 overflow-y-auto rounded-lg border border-border bg-background p-1 space-y-0.5">
          {loading && directories.length === 0 ? (
            <div className="flex h-full items-center justify-center text-body-sm text-muted-foreground">
              <RefreshCw size={16} className="animate-spin me-2" />
              <Trans>Loading folders...</Trans>
            </div>
          ) : directories.length === 0 ? (
            <div className="flex h-full items-center justify-center text-body-sm text-muted-foreground">
              <Trans>No subfolders in this directory</Trans>
            </div>
          ) : (
            directories.map((dir) => {
              const isSelected = selectedPath.toLowerCase() === dir.path.toLowerCase();
              return (
                <div
                  key={dir.path}
                  className={`group flex items-center justify-between rounded-md px-1.5 py-1 text-body-sm transition-colors ${
                    isSelected
                      ? "bg-accent text-accent-foreground font-medium"
                      : "hover:bg-muted/70 text-foreground/80"
                  }`}
                >
                  <button
                    type="button"
                    className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer py-0.5 px-1"
                    onClick={() => setSelectedPath(dir.path)}
                    onDoubleClick={() => void loadPath(dir.path)}
                  >
                    <Folder
                      size={15}
                      className={
                        isSelected ? "text-primary shrink-0" : "text-muted-foreground shrink-0"
                      }
                    />
                    <span className="truncate">{dir.name}</span>
                  </button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    type="button"
                    className="opacity-40 group-hover:opacity-100 transition-opacity"
                    onClick={() => void loadPath(dir.path)}
                    aria-label={t`Open ${dir.name}`}
                  >
                    <ChevronRight size={13} />
                  </Button>
                </div>
              );
            })
          )}
        </div>

        {/* Selected Summary and Footer */}
        <div className="flex items-center justify-between text-label text-muted-foreground pt-1">
          <span className="min-w-0 truncate font-mono">
            {selectedPath ? (
              <>
                <Trans>Selected:</Trans> <strong className="text-foreground">{selectedPath}</strong>
              </>
            ) : (
              <Trans>Single-click to select, double-click to open</Trans>
            )}
          </span>
        </div>

        <DialogFooter className="flex items-center justify-end gap-2 pt-2">
          <Button variant="outline" type="button" onClick={onClose}>
            <Trans>Cancel</Trans>
          </Button>
          <Button
            type="button"
            disabled={!selectedPath}
            onClick={() => {
              if (selectedPath) {
                onSelect(selectedPath);
                onClose();
              }
            }}
          >
            <Trans>Select this folder</Trans>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
