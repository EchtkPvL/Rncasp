import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfirmDialog } from "./ConfirmDialog";

// Mock react-i18next
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "common:confirm": "Confirm",
        "common:cancel": "Cancel",
      };
      return translations[key] ?? key;
    },
  }),
}));

describe("ConfirmDialog", () => {
  it("renders nothing when not open", () => {
    const { container } = render(
      <ConfirmDialog
        open={false}
        message="Delete this?"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders title and message when open", () => {
    render(
      <ConfirmDialog
        open={true}
        title="Delete Item"
        message="Are you sure?"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByText("Delete Item")).toBeInTheDocument();
    expect(screen.getByText("Are you sure?")).toBeInTheDocument();
  });

  it("uses default title from translations when none provided", () => {
    render(
      <ConfirmDialog
        open={true}
        message="Are you sure?"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    const heading = screen.getByRole("heading", { name: "Confirm" });
    expect(heading).toBeInTheDocument();
  });

  it("calls onConfirm when confirm button is clicked", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        message="Delete?"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />
    );
    const buttons = screen.getAllByText("Confirm");
    fireEvent.click(buttons.find((b) => b.tagName === "BUTTON")!);
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("calls onCancel when cancel button is clicked", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        message="Delete?"
        onConfirm={() => {}}
        onCancel={onCancel}
      />
    );
    fireEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("calls onCancel when overlay is clicked", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        message="Delete?"
        onConfirm={() => {}}
        onCancel={onCancel}
      />
    );
    // The overlay is the outermost div with the bg-black/50 class
    const overlay = screen.getByText("Delete?").closest(".fixed");
    fireEvent.click(overlay!);
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("does not call onCancel when dialog content is clicked", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        message="Delete?"
        onConfirm={() => {}}
        onCancel={onCancel}
      />
    );
    fireEvent.click(screen.getByText("Delete?"));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("uses custom button labels", () => {
    render(
      <ConfirmDialog
        open={true}
        message="Delete?"
        confirmLabel="Yes, delete"
        cancelLabel="No, keep"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByText("Yes, delete")).toBeInTheDocument();
    expect(screen.getByText("No, keep")).toBeInTheDocument();
  });

  it("disables buttons when loading", () => {
    render(
      <ConfirmDialog
        open={true}
        message="Delete?"
        loading={true}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    const buttons = screen.getAllByRole("button");
    buttons.forEach((btn) => expect(btn).toBeDisabled());
  });

  it("applies destructive styling to confirm button", () => {
    render(
      <ConfirmDialog
        open={true}
        message="Delete?"
        destructive
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    const buttons = screen.getAllByText("Confirm");
    const confirmBtn = buttons.find((b) => b.tagName === "BUTTON")!;
    expect(confirmBtn.className).toContain("destructive");
  });
});
