import { Trans, useLingui } from "@lingui/react/macro";
import { Button, Input } from "@rakazo/ui-web";
import { useEffect, useId, useState } from "react";
import { SettingsGroup, SettingsRow } from "../components/SettingsRows";
import { SpaceMembersSettings } from "../components/SpaceMembersSettings";
import { useSpaceRpc } from "../lib/space-rpc";
import { SpaceSettingOverrides } from "./SpaceSettingOverrides";
import type { SettingsSpace } from "./shell/dialogs";
import { DeleteSpaceDialog } from "./shell/dialogs";

/**
 * One space's page: its name, its members, the account settings it customizes, and deletion for
 * its owner.
 */
export function SpaceSettingsPanel({
  space,
  onRename,
  onDelete,
  onLeft,
  onClose,
  onBusyChange,
}: {
  space: SettingsSpace;
  onRename: (name: string) => Promise<void>;
  onDelete: () => Promise<void>;
  /** After leaving, with the space the server moved this person to. */
  onLeft: (activeSpaceId: string) => void;
  onClose: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { t } = useLingui();
  const rpc = useSpaceRpc();
  const nameId = useId();
  const pathId = useId();
  const [draft, setDraft] = useState(space.name);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pathDraft, setPathDraft] = useState(space.localProjectPath ?? "");
  const [pathPending, setPathPending] = useState(false);
  const [pathError, setPathError] = useState<string | null>(null);
  const [pathSaved, setPathSaved] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [overridesBusy, setOverridesBusy] = useState(false);
  // A rename in flight holds the dialog open, so a failure is shown instead of lost on leaving.
  const busy = pending || pathPending || overridesBusy;
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  async function save() {
    const trimmed = draft.trim();
    if (pending) return;
    // An empty or unchanged name keeps the current one without a request.
    if (!trimmed || trimmed === space.name) {
      setDraft(space.name);
      setError(null);
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onRename(trimmed);
      setDraft(trimmed);
    } catch (err) {
      setError(
        err instanceof Error && err.message.trim() ? err.message : t`Could not rename space`,
      );
    } finally {
      setPending(false);
    }
  }

  async function savePath() {
    const trimmed = pathDraft.trim();
    if (pathPending) return;
    if (trimmed === (space.localProjectPath ?? "")) {
      setPathError(null);
      return;
    }
    setPathPending(true);
    setPathError(null);
    setPathSaved(false);
    try {
      await rpc.spaces.setLocalProjectPath({
        spaceId: space.id,
        path: trimmed || null,
      });
      space.localProjectPath = trimmed || null;
      setPathSaved(true);
    } catch (err) {
      setPathError(
        err instanceof Error && err.message.trim() ? err.message : t`Could not save project path`,
      );
    } finally {
      setPathPending(false);
    }
  }

  return (
    <div className="space-y-8" data-testid="space-settings">
      {space.canRename ? (
        <SettingsGroup>
          <SettingsRow
            label={
              <label htmlFor={nameId}>
                <Trans>Name</Trans>
              </label>
            }
            control={
              <Input
                id={nameId}
                className="w-56"
                maxLength={60}
                value={draft}
                disabled={pending}
                onChange={(event) => {
                  setDraft(event.target.value);
                  setError(null);
                }}
                onBlur={() => void save()}
                onKeyDown={(event) => {
                  if (event.key === "Escape") event.stopPropagation();
                  // Enter or Escape that ends an IME composition is not a commit or cancel.
                  if (event.nativeEvent.isComposing || event.keyCode === 229) return;
                  if (event.key === "Enter") {
                    event.currentTarget.blur();
                  }
                  if (event.key === "Escape") {
                    setDraft(space.name);
                    setError(null);
                  }
                }}
              />
            }
          >
            {error ? (
              <p role="alert" className="pt-2 text-body-sm text-destructive">
                {error}
              </p>
            ) : null}
          </SettingsRow>
          <SettingsRow
            label={
              <label htmlFor={pathId}>
                <Trans>Local project path</Trans>
              </label>
            }
            control={
              <div className="flex items-center gap-2">
                <Input
                  id={pathId}
                  className="w-72"
                  maxLength={1024}
                  placeholder="E:\Projects\WebShop"
                  value={pathDraft}
                  disabled={pathPending}
                  onChange={(event) => {
                    setPathDraft(event.target.value);
                    setPathError(null);
                    setPathSaved(false);
                  }}
                  onBlur={() => void savePath()}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") event.stopPropagation();
                    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
                    if (event.key === "Enter") {
                      event.currentTarget.blur();
                    }
                    if (event.key === "Escape") {
                      setPathDraft(space.localProjectPath ?? "");
                      setPathError(null);
                    }
                  }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pathPending || pathDraft.trim() === (space.localProjectPath ?? "")}
                  onClick={() => void savePath()}
                >
                  <Trans>Save</Trans>
                </Button>
              </div>
            }
          >
            {pathError ? (
              <p role="alert" className="pt-2 text-body-sm text-destructive">
                {pathError}
              </p>
            ) : pathSaved ? (
              <p className="pt-2 text-body-sm text-success">
                <Trans>Project path saved</Trans>
              </p>
            ) : null}
          </SettingsRow>
        </SettingsGroup>
      ) : null}
      <SpaceMembersSettings space={space} onLeft={onLeft} />
      <SpaceSettingOverrides onClose={onClose} onBusyChange={setOverridesBusy} />
      {space.canDelete ? (
        <Button
          variant="destructive"
          className="rounded-full"
          onClick={() => setConfirmingDelete(true)}
        >
          <Trans>Delete space</Trans>
        </Button>
      ) : null}
      {confirmingDelete ? (
        <DeleteSpaceDialog
          space={space}
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={onDelete}
        />
      ) : null}
    </div>
  );
}
