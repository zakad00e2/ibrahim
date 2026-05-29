// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CustomersPage } from "./CustomersPage";
import type { Debt, Invoice } from "../types";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const storeMocks = vi.hoisted(() => {
  const debt: Debt = {
    id: "debt-1",
    invoiceId: "invoice-1",
    description: "فاتورة اختبار",
    date: "2026-05-23T10:00:00.000Z",
    amount: 50,
    paid: 20,
    remaining: 30,
    isPaid: false,
    payments: [],
  };

  const customer = {
    id: "customer-1",
    name: "رامي رامي",
    phone: "0597986160",
    debts: [debt],
  };

  const invoice: Invoice = {
    id: "invoice-1",
    number: "INV-2026-001",
    date: "2026-05-23T10:00:00.000Z",
    customerId: "customer-1",
    customerName: "رامي رامي",
    items: [],
    total: 50,
    paid: 20,
    remaining: 30,
    paymentMethod: "partial" as const,
  };

  return {
    customer,
    debt,
    invoice,
    addCustomer: vi.fn(async () => ({ ok: true, message: "ok", id: "customer-2" })),
    deleteCustomer: vi.fn(async () => ({ ok: true, message: "ok" })),
    loadCustomerDetail: vi.fn(async () => undefined),
    loadDebtDetail: vi.fn(async () => debt),
    loadInvoiceDetail: vi.fn(async () => null),
    payCustomerDebt: vi.fn(async () => ({ ok: true, message: "ok" })),
    payDebt: vi.fn(async () => ({ ok: true, message: "ok" })),
    setCustomersQuery: vi.fn(),
    updateCustomer: vi.fn(async () => ({ ok: true, message: "ok" })),
  };
});

vi.mock("../store/AppStore", () => ({
  useAppStore: () => ({
    customers: [storeMocks.customer],
    customersLoading: false,
    customersError: null,
    customersQuery: { search: "", page: 1, limit: 20 },
    customersTotal: 1,
    invoices: [storeMocks.invoice],
    setCustomersQuery: storeMocks.setCustomersQuery,
    loadCustomerDetail: storeMocks.loadCustomerDetail,
    addCustomer: storeMocks.addCustomer,
    updateCustomer: storeMocks.updateCustomer,
    deleteCustomer: storeMocks.deleteCustomer,
    payCustomerDebt: storeMocks.payCustomerDebt,
    payDebt: storeMocks.payDebt,
    loadDebtDetail: storeMocks.loadDebtDetail,
    loadInvoiceDetail: storeMocks.loadInvoiceDetail,
  }),
}));

const renderCustomersPage = async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<CustomersPage />);
  });

  return { container, root };
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

describe("CustomersPage details modal", () => {
  let mounted: { container: HTMLDivElement; root: Root } | null;

  beforeEach(() => {
    mounted = null;
    vi.clearAllMocks();
    storeMocks.invoice.items = [];
    storeMocks.loadDebtDetail.mockResolvedValue(storeMocks.debt);
  });

  afterEach(async () => {
    if (mounted) {
      await act(async () => {
        mounted?.root.unmount();
      });
      mounted.container.remove();
    }

    document.body.innerHTML = "";
  });

  it("does not show the pay debt action in the customer details footer", async () => {
    mounted = await renderCustomersPage();

    await act(async () => {
      findButtonByText(mounted!.container, "تسديد الدين").click();
    });

    const dialog = document.querySelector('[role="dialog"][aria-label="تفاصيل العميل"]');
    if (!(dialog instanceof HTMLElement)) {
      throw new Error("Customer details dialog was not rendered");
    }

    const footer = dialog.querySelector("footer");
    if (!(footer instanceof HTMLElement)) {
      throw new Error("Customer details footer was not rendered");
    }

    expect(footer.textContent).not.toContain("تسديد دين");
    expect(footer.textContent).toContain("إغلاق");
  });

  it("keeps the customer payment amount box visible after recording a payment", async () => {
    mounted = await renderCustomersPage();

    await act(async () => {
      findButtonByText(mounted!.container, "تسديد الدين").click();
    });

    const dialog = document.querySelector('[role="dialog"][aria-label="تفاصيل العميل"]');
    if (!(dialog instanceof HTMLElement)) {
      throw new Error("Customer details dialog was not rendered");
    }

    expect(dialog.textContent).toContain("مبلغ الدفع");

    await act(async () => {
      findButtonByText(dialog, "تسجيل التسديد").click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(storeMocks.payCustomerDebt).toHaveBeenCalledWith("customer-1", 0);
    expect(dialog.textContent).toContain("مبلغ الدفع");
    expect(findButtonByText(dialog, "تسجيل التسديد")).toBeInstanceOf(HTMLButtonElement);
  });

  it("shows invoice number instead of debt description in the customer debts table", async () => {
    mounted = await renderCustomersPage();

    await act(async () => {
      findButtonByText(mounted!.container, "تسديد الدين").click();
    });

    const dialog = document.querySelector('[role="dialog"][aria-label="تفاصيل العميل"]');
    if (!(dialog instanceof HTMLElement)) {
      throw new Error("Customer details dialog was not rendered");
    }

    expect(dialog.textContent).toContain("رقم الفاتورة");
    expect(dialog.textContent).toContain("INV-2026-001");
    expect(dialog.textContent).not.toContain("الوصف");
    expect(dialog.textContent).not.toContain("فاتورة اختبار");
  });

  it("keeps invoice products visible when the debt has payments", async () => {
    storeMocks.invoice.items = [
      {
        productId: "product-1",
        productName: "Test Product",
        barcode: "123",
        price: 25,
        wholesalePrice: 15,
        quantity: 2,
        total: 50,
      },
    ];
    storeMocks.loadDebtDetail.mockResolvedValueOnce({
      ...storeMocks.debt,
      payments: [
        {
          id: "payment-1",
          amount: 10,
          date: "2026-05-24T10:00:00.000Z",
          notes: "cash payment",
        },
      ],
    });
    mounted = await renderCustomersPage();

    await act(async () => {
      findButtonByText(mounted!.container, "\u062a\u0633\u062f\u064a\u062f \u0627\u0644\u062f\u064a\u0646").click();
    });
    await act(async () => {
      findButtonByText(document.body, "\u0639\u0631\u0636 \u0627\u0644\u062a\u0641\u0627\u0635\u064a\u0644").click();
    });

    const dialogs = document.querySelectorAll('[role="dialog"]');
    const dialog = dialogs[dialogs.length - 1];
    if (!(dialog instanceof HTMLElement)) {
      throw new Error("Debt details dialog was not rendered");
    }

    expect(dialog.textContent).toContain("cash payment");
    expect(dialog.textContent).toContain("Test Product");
  });
});
