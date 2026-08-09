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
    discount: "",
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

const clickProduct = async (container: HTMLElement, productName = storeHarness.product.name) => {
  const productButton = Array.from(container.querySelectorAll("button")).find((button) =>
    button.textContent?.includes(productName),
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

const getPrintButton = (container: HTMLElement) => {
  const summary = container.querySelector("aside");
  const completeSaleButton = getCompleteSaleButton(container);
  const summaryButtons = summary ? Array.from(summary.querySelectorAll("button")) : [];
  const completeSaleIndex = summaryButtons.indexOf(completeSaleButton);
  const button = completeSaleIndex > 0 ? summaryButtons[completeSaleIndex - 1] : null;

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error("Print invoice button was not rendered");
  }

  return button;
};

const setDiscount = async (container: HTMLElement, value: string) => {
  const input = container.querySelector('input[aria-label="خصم الفاتورة"]');

  if (!(input instanceof HTMLInputElement)) {
    throw new Error("Invoice discount input was not rendered");
  }

  await act(async () => {
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
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
      discount: 0,
    });
  });

  it("sends the fixed invoice discount when completing a sale", async () => {
    const view = await renderCashier();

    await clickProduct(view.container);
    await setDiscount(view.container, "5");

    await act(async () => {
      getCompleteSaleButton(view.container).click();
    });

    expect(storeHarness.completeSale).toHaveBeenCalledWith(expect.objectContaining({
      discount: 5,
    }));
  });

  it("prints the discount and final total when the invoice has a discount", async () => {
    const view = await renderCashier();

    await clickProduct(view.container);
    await setDiscount(view.container, "5");

    await act(async () => {
      getPrintButton(view.container).click();
    });

    const receipt = document.body.querySelector(".print-receipt");

    if (!(receipt instanceof HTMLElement)) {
      throw new Error("Printable receipt was not rendered");
    }

    expect(receipt.textContent).toContain("الخصم");
    expect(receipt.textContent).toContain("المجموع بعد الخصم");
  });

  it("renders the printable invoice with a print date and without a currency symbol", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-01T09:30:00Z"));

    try {
      const view = await renderCashier();

      await clickProduct(view.container);

      await act(async () => {
        getPrintButton(view.container).click();
      });

      const receipt = document.body.querySelector(".print-receipt");

      if (!(receipt instanceof HTMLElement)) {
        throw new Error("Printable receipt was not rendered");
      }

      expect(receipt.textContent).not.toContain("\u20AA");
      expect(receipt.textContent).toContain("2026");
    } finally {
      vi.useRealTimers();
    }
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

  it("keeps current invoice items in a scroll area so the summary can stay visible", async () => {
    const view = await renderCashier();

    const invoiceScroller = view.container.querySelector('[aria-label="قائمة الفاتورة الحالية قابلة للتمرير"]');

    if (!(invoiceScroller instanceof HTMLElement)) {
      throw new Error("Current invoice scroller was not rendered");
    }

    expect(invoiceScroller.className).toContain("overflow-y-auto");
    expect(invoiceScroller.className).toContain("max-h-");
    expect(invoiceScroller.className).not.toContain("overscroll-y-contain");

    const summaryHeading = Array.from(view.container.querySelectorAll("h3")).find((heading) =>
      heading.textContent?.includes("ملخص الفاتورة"),
    );
    const summary = summaryHeading?.closest("aside");

    if (!(summary instanceof HTMLElement)) {
      throw new Error("Invoice summary was not rendered");
    }

    expect(summary.className).toContain("lg:sticky");
    expect(summary.className).toContain("lg:top-5");
  });

  it("scrolls the current invoice list with the mouse wheel when hovering invoice rows", async () => {
    const view = await renderCashier();

    for (const product of storeHarness.products) {
      await clickProduct(view.container, product.name);
    }

    const invoiceScroller = view.container.querySelector('[aria-label="قائمة الفاتورة الحالية قابلة للتمرير"]');

    if (!(invoiceScroller instanceof HTMLElement)) {
      throw new Error("Current invoice scroller was not rendered");
    }

    Object.defineProperties(invoiceScroller, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 400 },
    });

    const table = invoiceScroller.querySelector("table");

    if (!(table instanceof HTMLElement)) {
      throw new Error("Invoice table was not rendered");
    }

    expect(table.parentElement?.className).not.toContain("overflow-x-auto");

    await act(async () => {
      table.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 80 }));
    });

    expect(invoiceScroller.scrollTop).toBe(80);
  });

  it("lets the page continue scrolling when the current invoice list is already at an edge", async () => {
    const view = await renderCashier();

    for (const product of storeHarness.products) {
      await clickProduct(view.container, product.name);
    }

    const invoiceScroller = view.container.querySelector('[aria-label="قائمة الفاتورة الحالية قابلة للتمرير"]');

    if (!(invoiceScroller instanceof HTMLElement)) {
      throw new Error("Current invoice scroller was not rendered");
    }

    Object.defineProperties(invoiceScroller, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 400 },
    });
    invoiceScroller.scrollTop = 300;

    const wheelEvent = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 80 });

    await act(async () => {
      invoiceScroller.dispatchEvent(wheelEvent);
    });

    expect(invoiceScroller.scrollTop).toBe(300);
    expect(wheelEvent.defaultPrevented).toBe(false);
  });
});
