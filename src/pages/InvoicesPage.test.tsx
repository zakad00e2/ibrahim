// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InvoicesPage } from "./InvoicesPage";
import type { Invoice, Product } from "../types";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const storeMocks = vi.hoisted(() => {
  const invoice: Invoice = {
    id: "invoice-1",
    number: "INV-2026-001",
    date: "2026-05-31T10:00:00.000Z",
    customerId: undefined,
    customerName: "\u0628\u064a\u0639 \u0645\u0628\u0627\u0634\u0631",
    items: [],
    total: 50,
    paid: 50,
    remaining: 0,
    paymentMethod: "cash",
  };

  const product: Product = {
    id: "product-1",
    name: "\u0633\u0643\u0631",
    barcode: "1234567890",
    price: 25,
    wholesalePrice: 20,
    stock: 4,
    minStock: 2,
    isActive: true,
  };

  return {
    invoice,
    product,
    deleteInvoice: vi.fn(async () => ({ ok: true, message: "ok" })),
    loadInvoiceDetail: vi.fn(async () => invoice),
    setInvoicesQuery: vi.fn(),
    updateInvoice: vi.fn(async () => ({ ok: true, message: "ok" })),
  };
});

vi.mock("../store/AppStore", () => ({
  useAppStore: () => ({
    invoices: [storeMocks.invoice],
    invoicesLoading: false,
    invoicesError: null,
    invoicesQuery: { search: "", page: 1, limit: 20 },
    invoicesTotal: 1,
    setInvoicesQuery: storeMocks.setInvoicesQuery,
    loadInvoiceDetail: storeMocks.loadInvoiceDetail,
    products: [storeMocks.product],
    updateInvoice: storeMocks.updateInvoice,
    deleteInvoice: storeMocks.deleteInvoice,
  }),
}));

const renderInvoicesPage = async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<InvoicesPage />);
  });

  return { container, root };
};

const findTrashButton = (container: HTMLElement) => {
  const button = container.querySelector(
    'button[aria-label="\u062d\u0630\u0641 \u0627\u0644\u0641\u0627\u062a\u0648\u0631\u0629"]',
  );

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error("Trash button was not rendered");
  }

  return button;
};

const findButtonByText = (container: HTMLElement, text: string) => {
  const button = Array.from(container.querySelectorAll("button")).find((candidate) =>
    candidate.textContent?.includes(text),
  );

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Button with text "${text}" was not rendered`);
  }

  return button;
};

describe("InvoicesPage delete confirmation", () => {
  let mounted: { container: HTMLDivElement; root: Root } | null;
  let confirmSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mounted = null;
    vi.clearAllMocks();
    confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
  });

  afterEach(async () => {
    if (mounted) {
      await act(async () => {
        mounted?.root.unmount();
      });
      mounted.container.remove();
    }

    confirmSpy.mockRestore();
    document.body.innerHTML = "";
  });

  it("opens an in-app popup before deleting an invoice instead of using the browser confirm dialog", async () => {
    mounted = await renderInvoicesPage();

    await act(async () => {
      findTrashButton(mounted!.container).click();
    });

    expect(confirmSpy).not.toHaveBeenCalled();

    const dialog = document.querySelector('[role="dialog"][aria-label="\u062a\u0623\u0643\u064a\u062f \u062d\u0630\u0641 \u0627\u0644\u0641\u0627\u062a\u0648\u0631\u0629"]');
    if (!(dialog instanceof HTMLElement)) {
      throw new Error("Delete invoice confirmation dialog was not rendered");
    }

    expect(dialog.textContent).toContain("INV-2026-001");

    await act(async () => {
      findButtonByText(dialog, "\u062d\u0630\u0641").click();
      await Promise.resolve();
    });

    expect(storeMocks.deleteInvoice).toHaveBeenCalledWith("invoice-1");
  });
});
