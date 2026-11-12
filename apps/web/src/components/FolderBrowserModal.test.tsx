// @vitest-environment jsdom
import type { ComponentProps, ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FolderBrowserModal } from "./FolderBrowserModal";

vi.mock("@lingui/react/macro", () => {
  const t = (parts: TemplateStringsArray, ...values: unknown[]) =>
    parts.reduce((text, part, index) => `${text}${index > 0 ? values[index - 1] : ""}${part}`, "");
  const _ = (desc: any) => desc?.message ?? desc?.id ?? String(desc);
  const fn = () => _;
  return {
    useLingui: () => ({ t, _: _, i18n: { _: _ } }),
    Trans: (props: any) => props.children ?? props.message ?? props.id ?? null,
    _t: fn,
  };
});
vi.mock("@lingui/react", () => {
  const t = (parts: TemplateStringsArray, ...values: unknown[]) =>
    parts.reduce((text, part, index) => `${text}${index > 0 ? values[index - 1] : ""}${part}`, "");
  const _ = (desc: any) => desc?.message ?? desc?.id ?? String(desc);
  const fn = () => _;
  return {
    useLingui: () => ({ t, _: _, i18n: { _: _ } }),
    Trans: (props: any) => props.children ?? props.message ?? props.id ?? null,
    _t: fn,
  };
});

vi.mock("@rakazo/ui-web", () => {
  const Plain = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return {
    Button: ({
      variant: _variant,
      size: _size,
      ...props
    }: ComponentProps<"button"> & { variant?: string; size?: string }) => <button {...props} />,
    Dialog: ({
      open,
      onOpenChange,
      children,
    }: {
      open: boolean;
      onOpenChange: (open: boolean) => void;
      children?: ReactNode;
    }) =>
      open ? (
        <div role="dialog">
          {children}
          <button type="button" onClick={() => onOpenChange(false)}>
            Close
          </button>
        </div>
      ) : null,
    DialogContent: Plain,
    DialogHeader: Plain,
    DialogTitle: Plain,
    DialogDescription: Plain,
    DialogFooter: Plain,
  };
});

describe("FolderBrowserModal", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("renders drives and directories returned from API", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        drives: ["C:", "D:", "E:"],
        current: "E:\\Project",
        parent: "E:\\",
        directories: [
          { name: "Flowlab", path: "E:\\Project\\Flowlab" },
          { name: "Quroum", path: "E:\\Project\\Quroum" },
        ],
      }),
    });

    await act(async () => {
      root.render(
        <FolderBrowserModal open initialPath="E:\Project" onClose={() => {}} onSelect={() => {}} />,
      );
    });

    // Wait for useEffect fetch to settle
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain("E:\\Project");
    expect(container.textContent).toContain("Flowlab");
    expect(container.textContent).toContain("Quroum");
    expect(container.textContent).toContain("C:\\");
    expect(container.textContent).toContain("D:\\");
    expect(container.textContent).toContain("E:\\");
  });

  it("calls onSelect with chosen directory when clicking select button", async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        drives: ["E:"],
        current: "E:\\Project",
        parent: "E:\\",
        directories: [{ name: "Flowlab", path: "E:\\Project\\Flowlab" }],
      }),
    });

    await act(async () => {
      root.render(
        <FolderBrowserModal open initialPath="E:\Project" onClose={onClose} onSelect={onSelect} />,
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    // Click on Flowlab directory
    const dirBtn = container.querySelector("button.cursor-pointer") as HTMLButtonElement;
    expect(dirBtn).not.toBeNull();
    await act(async () => {
      dirBtn.click();
    });

    // Click "Select this folder" button
    const selectBtn = Array.from(container.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("Select this folder"),
    );
    expect(selectBtn).toBeDefined();

    await act(async () => {
      selectBtn?.click();
    });

    expect(onSelect).toHaveBeenCalledWith("E:\\Project\\Flowlab");
    expect(onClose).toHaveBeenCalled();
  });
});
