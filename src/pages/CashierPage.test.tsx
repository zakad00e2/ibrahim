// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CashierPage } from "./CashierPage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const storeHarness = vi.hoisted(() => {
  const emptyDraft = () => ({
    items: [],
    paymentMethod: "cash",
    selectedCustomerId: "",
    customerSearch: "",
    paidAmount: "",
  });

  const product = {
    id: "product-1",
    name: "Test Rice",
    barcode: "1234567890",
    price: 45,
    wholesalePrice: 35,
    stock: 8,
    minStock: 2,
    isActive: true,
  };

  const products = [
    product,
    {
      id: "product-2",
      name: "Test Sugar",
      barcode: "2222222222",
      price: 15,
      wholesalePrice: 10,
      stock: 6,
      minStock: 2,
      isActive: true,
    },
    {
      id: "product-3",
      name: "Test Tea",
      barcode: "3333333333",
      price: 20,
      wholesalePrice: 12,
      stock: 9,
      minStock: 2,
      isActive: true,
    },
  ];

  let cashierDraft = emptyDraft();
  const completeSale = vi.fn(async () => ({ ok: true, message: "ok", id: "invoice-1" }));
  const subscribers = new Set<() => void>();

  const emit = () => {
    subscribers.forEach((subscriber) => subscriber());
  };

  return {
    product,
    products,
    getCashierDraft: () => cashierDraft,
    resetCashierDraft: () => {
      cashierDraft = emptyDraft();
      emit();
    },
    completeSale,
    setCashierDraft: (nextDraft: typeof cashierDraft | ((current: typeof cashierDraft) => typeof cashierDraft)) => {
      cashierDraft = typeof nextDraft === "function" ? nextDraft(cashierDraft) : nextDraft;
      emit();
    },
    subscribe: (subscriber: () => void) => {
      subscribers.add(subscriber);
      return () => {
        subscribers.delete(subscriber);
      };
    },
  };
});

vi.mock("../services/storeApi", () => ({
  DEFAULT_STORE_NAME: "Test Store",
  getStoreInfo: vi.fn(async () => ({ name: "Test Store" })),
}));

vi.mock("../store/AppStore", async () => {
  const React = await import("react");

  return {
    useAppStore: () => {
      const [, forceRender] = React.useReducer((current: number) => current + 1, 0);

      React.useEffect(() => storeHarness.subscribe(forceRender), []);

      return {
        products: storeHarness.products,
        customers: [],
        cashierDraft: storeHarness.getCashierDraft(),
        setCashierDraft: storeHarness.setCashierDraft,
        resetCashierDraft: storeHarness.resetCashierDraft,
        addCustomer: vi.fn(async () => ({ ok: true, message: "ok", id: "customer-1" })),
        completeSale: storeHarness.completeSale,
        findProductByBarcodeRemote: vi.fn(async () => null),
        setCustomersQuery: vi.fn(),
      };
    },
  };
});

const emptyInvoiceText = "لم تتم إضافة منتجات بعد";

let roots: Array<{ root: Root; container: HTMLDivElement }> = [];

const renderCashier = async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push({ root, container });

  await act(async () => {
    root.render(<CashierPage />);
  });

  return { root, container };
};

const unmount = async (target: { root: Root; container: HTMLDivElement }) => {
  await act(async () => {
    target.root.unmount();
  });
  target.container.remove();
  roots = roots.filter((entry) => entry !== target);
};

const clickProduct = async (container: HTMLElement) => {
  const productButton = Array.from(container.querySelectorAll("button")).find((button) =>
    button.textContent?.includes(storeHarness.product.name),
  );

  if (!productButton) {
    throw new Error("Product button was not rendered");
  }

  await act(async () => {
    productButton.click();
  });
};

const getCompleteSaleButton = (container: HTMLElement) => {
  const button = Array.from(container.querySelectorAll("button")).find((candidate) =>
    candidate.textContent?.includes("إتمام البيع"),
  );

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error("Complete sale button was not rendered");
  }

  return button;
};

describe("CashierPage invoice draft", () => {
  beforeEach(() => {
    storeHarness.resetCashierDraft();
  });

  afterEach(async () => {
    for (const target of roots) {
      await act(async () => {
        target.root.unmount();
      });
      target.container.remove();
    }
    roots = [];
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("keeps current invoice items when the cashier page unmounts during navigation", async () => {
    const firstVisit = await renderCashier();

    expect(firstVisit.container.textContent).toContain(emptyInvoiceText);

    await clickProduct(firstVisit.container);

    expect(firstVisit.container.textContent).not.toContain(emptyInvoiceText);
    expect(getCompleteSaleButton(firstVisit.container).disabled).toBe(false);

    await unmount(firstVisit);

    const secondVisit = await renderCashier();

    expect(secondVisit.container.textContent).not.toContain(emptyInvoiceText);
    expect(getCompleteSaleButton(secondVisit.container).disabled).toBe(false);
  });

  it("completes the sale when Enter is pressed with an empty barcode after adding items", async () => {
    const view = await renderCashier();

    await clickProduct(view.container);

    const barcodeInput = view.container.querySelector("#barcode");

    if (!(barcodeInput instanceof HTMLInputElement)) {
      throw new Error("Barcode input was not rendered");
    }

    await act(async () => {
      barcodeInput.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    expect(storeHarness.completeSale).toHaveBeenCalledTimes(1);
    expect(storeHarness.completeSale).toHaveBeenCalledWith({
      items: [
        expect.objectContaining({
          productId: storeHarness.product.id,
          quantity: 1,
        }),
      ],
      paymentMethod: "cash",
      customerId: undefined,
      paidAmount: 0,
    });
  });

  it("renders cashier products in a vertical scroll area", async () => {
    const view = await renderCashier();

    const productScroller = view.container.querySelector('[aria-label="قائمة منتجات قابلة للتمرير العمودي"]');

    if (!(productScroller instanceof HTMLElement)) {
      throw new Error("Vertical product scroller was not rendered");
    }

    expect(productScroller.className).toContain("overflow-y-auto");
    expect(productScroller.className).toContain("max-h-");
    expect(productScroller.className).not.toContain("grid-flow-col");

    const productButtons = Array.from(productScroller.querySelectorAll("button"));
    expect(productButtons).toHaveLength(storeHarness.products.length);
  });
});
