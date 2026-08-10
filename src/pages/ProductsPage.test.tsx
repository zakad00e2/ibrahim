// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProductsPage } from "./ProductsPage";
import type { Product } from "../types";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const storeMocks = vi.hoisted(() => {
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
    product,
    addProduct: vi.fn(async () => ({ ok: true, message: "ok", id: "product-2" })),
    deleteProduct: vi.fn(async () => undefined),
    refreshLowStock: vi.fn(async () => undefined),
    setProductsQuery: vi.fn(),
    updateProduct: vi.fn(async () => ({ ok: true, message: "ok" })),
  };
});

vi.mock("../store/AppStore", () => ({
  useAppStore: () => ({
    products: [storeMocks.product],
    productsLoading: false,
    productsError: null,
    productsQuery: { search: "", isActive: true, page: 1, limit: 20 },
    productsTotal: 1,
    lowStockCount: 0,
    setProductsQuery: storeMocks.setProductsQuery,
    refreshLowStock: storeMocks.refreshLowStock,
    addProduct: storeMocks.addProduct,
    updateProduct: storeMocks.updateProduct,
    deleteProduct: storeMocks.deleteProduct,
  }),
}));

const renderProductsPage = async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<ProductsPage />);
  });

  return { container, root };
};

const findButtonByLabel = (container: HTMLElement, label: string) => {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.getAttribute("aria-label") === label,
  );

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Button with aria-label "${label}" was not rendered`);
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

describe("ProductsPage delete confirmation", () => {
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

  it("opens an in-app popup before deleting a product instead of using the browser confirm dialog", async () => {
    mounted = await renderProductsPage();

    await act(async () => {
      findButtonByLabel(mounted!.container, "\u062d\u0630\u0641 \u0627\u0644\u0645\u0646\u062a\u062c").click();
    });

    expect(confirmSpy).not.toHaveBeenCalled();

    const dialog = document.querySelector('[role="dialog"][aria-label="\u062a\u0623\u0643\u064a\u062f \u062d\u0630\u0641 \u0627\u0644\u0645\u0646\u062a\u062c"]');
    if (!(dialog instanceof HTMLElement)) {
      throw new Error("Delete confirmation dialog was not rendered");
    }

    expect(dialog.textContent).toContain("\u0633\u0643\u0631");

    await act(async () => {
      findButtonByText(dialog, "\u062d\u0630\u0641").click();
      await Promise.resolve();
    });

    expect(storeMocks.deleteProduct).toHaveBeenCalledWith("product-1");
  });
});

describe("ProductsPage carton entry", () => {
  let mounted: { container: HTMLDivElement; root: Root } | null;

  beforeEach(() => {
    mounted = null;
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (mounted) {
      await act(async () => mounted?.root.unmount());
      mounted.container.remove();
    }
    document.body.innerHTML = "";
  });

  it("shows optional carton data controls when adding a product", async () => {
    mounted = await renderProductsPage();

    await act(async () => {
      findButtonByText(mounted!.container, "إضافة منتج").click();
    });

    expect(document.body.textContent).toContain("بيانات الكرتونة");
  });

  it("shows the calculated piece wholesale price while entering carton data", async () => {
    mounted = await renderProductsPage();
    await act(async () => findButtonByText(mounted!.container, "إضافة منتج").click());

    const checkbox = document.querySelector('input[type="checkbox"]');
    if (!(checkbox instanceof HTMLInputElement)) throw new Error("Carton toggle was not rendered");
    await act(async () => checkbox.click());

    const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
    const piecesInput = inputs.find((input) => input.parentElement?.textContent?.includes("عدد القطع في الكرتونة"));
    const purchaseInput = inputs.find((input) => input.parentElement?.textContent?.includes("سعر شراء الكرتونة"));
    if (!(piecesInput instanceof HTMLInputElement) || !(purchaseInput instanceof HTMLInputElement)) throw new Error("Carton inputs were not rendered");

    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setValue?.call(piecesInput, "12");
      piecesInput.dispatchEvent(new Event("input", { bubbles: true }));
      setValue?.call(purchaseInput, "180");
      purchaseInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(document.body.textContent).toContain("سعر جملة القطعة المحسوب");
    expect(document.body.textContent).toContain("١٥");
  });

  it("submits a carton product without a manually entered wholesale price", async () => {
    mounted = await renderProductsPage();
    await act(async () => findButtonByText(mounted!.container, "إضافة منتج").click());
    const checkbox = document.querySelector('input[type="checkbox"]');
    if (!(checkbox instanceof HTMLInputElement)) throw new Error("Carton toggle was not rendered");
    await act(async () => checkbox.click());

    const setInput = (label: string, value: string) => {
      const input = Array.from(document.querySelectorAll("input")).find((candidate) =>
        candidate.parentElement?.textContent?.includes(label),
      );
      if (!(input instanceof HTMLInputElement)) throw new Error(`Missing ${label}`);
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };

    await act(async () => {
      setInput("اسم المنتج", "شاي");
      setInput("سعر البيع", "3");
      setInput("عدد القطع في الكرتونة", "24");
      setInput("عدد الكراتين", "4");
      setInput("سعر شراء الكرتونة", "20");
      setInput("سعر بيع الكرتونة", "30");
    });
    await act(async () => {
      findButtonByText(document.body, "إضافة المنتج").click();
      await Promise.resolve();
    });

    expect(storeMocks.addProduct).toHaveBeenCalledWith(expect.objectContaining({
      wholesalePrice: 0.83,
      stock: 96,
    }));
  });
});
