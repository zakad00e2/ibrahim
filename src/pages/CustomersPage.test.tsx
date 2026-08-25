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

const findButtonByLabel = (container: HTMLElement, label: string) => {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.getAttribute("aria-label") === label,
  );

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Button with aria-label "${label}" was not rendered`);
  }

  return button;
};

describe("CustomersPage details modal", () => {
  let mounted: { container: HTMLDivElement; root: Root } | null;
  let confirmSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mounted = null;
    vi.clearAllMocks();
    storeMocks.invoice.items = [];
    storeMocks.debt.payments = [];
    storeMocks.customer.debts = [storeMocks.debt];
    storeMocks.loadDebtDetail.mockResolvedValue(storeMocks.debt);
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

  it("shows the signed balance label in the customers table", async () => {
    mounted = await renderCustomersPage();

    expect(mounted.container.textContent).toContain("الرصيد");
    expect(mounted.container.textContent).not.toContain("إجمالي الدين");
  });

  it("keeps the pay-debt action enabled when the customer has no outstanding debt", async () => {
    storeMocks.customer.debts = [];
    mounted = await renderCustomersPage();

    const payDebtButton = findButtonByText(mounted.container, "تسديد الدين");

    expect(payDebtButton.disabled).toBe(false);

    await act(async () => {
      payDebtButton.click();
    });

    expect(document.querySelector('[role="dialog"][aria-label="تفاصيل العميل"]')).toBeInstanceOf(HTMLElement);
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

  it("shows all customer payments in one newest-first history table", async () => {
    storeMocks.debt.payments = [
      {
        id: "payment-oldest",
        amount: 2,
        date: "2026-08-22T08:00:00.000Z",
        notes: "oldest payment",
      },
      {
        id: "payment-newest",
        amount: 3,
        date: "2026-08-22T10:00:00.000Z",
        notes: "newest payment",
      },
    ];
    storeMocks.customer.debts = [
      storeMocks.debt,
      {
        ...storeMocks.debt,
        id: "debt-2",
        invoiceId: "invoice-2",
        invoiceNumber: "INV-2026-002",
        payments: [
          {
            id: "payment-middle",
            amount: 4,
            date: "2026-08-22T09:00:00.000Z",
            notes: "middle payment",
          },
        ],
      },
    ];
    mounted = await renderCustomersPage();

    await act(async () => {
      findButtonByText(mounted!.container, "تسديد الدين").click();
    });

    const dialog = document.querySelector('[role="dialog"][aria-label="تفاصيل العميل"]');
    if (!(dialog instanceof HTMLElement)) {
      throw new Error("Customer details dialog was not rendered");
    }

    const heading = Array.from(dialog.querySelectorAll("p")).find(
      (element) => element.textContent === "سجل دفعات العميل",
    );
    const history = heading?.parentElement;
    if (!(history instanceof HTMLElement)) {
      throw new Error("Customer payment history was not rendered");
    }

    const rows = Array.from(history.querySelectorAll("tbody tr"));
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("newest payment"),
      expect.stringContaining("middle payment"),
      expect.stringContaining("oldest payment"),
    ]);
    expect(history.textContent).toContain("INV-2026-001");
    expect(history.textContent).toContain("INV-2026-002");
    expect(history.textContent).not.toContain("غير متوفر");
  });

  it("shows an empty payment-history state when the customer has no payments", async () => {
    mounted = await renderCustomersPage();

    await act(async () => {
      findButtonByText(mounted!.container, "تسديد الدين").click();
    });

    const dialog = document.querySelector('[role="dialog"][aria-label="تفاصيل العميل"]');
    if (!(dialog instanceof HTMLElement)) {
      throw new Error("Customer details dialog was not rendered");
    }

    expect(dialog.textContent).toContain("سجل دفعات العميل");
    expect(dialog.textContent).toContain("لا توجد دفعات مسجلة لهذا العميل");
  });

  it("places customer payment history directly below the payment form", async () => {
    mounted = await renderCustomersPage();

    await act(async () => {
      findButtonByText(mounted!.container, "تسديد الدين").click();
    });

    const dialog = document.querySelector('[role="dialog"][aria-label="تفاصيل العميل"]');
    if (!(dialog instanceof HTMLElement)) {
      throw new Error("Customer details dialog was not rendered");
    }

    const paymentButton = findButtonByText(dialog, "تسجيل التسديد");
    const historyHeading = Array.from(dialog.querySelectorAll("p")).find(
      (element) => element.textContent === "سجل دفعات العميل",
    );
    const debtsTable = Array.from(dialog.querySelectorAll("table")).find(
      (table) => table.textContent?.includes("أصل الدين"),
    );

    if (!(historyHeading instanceof HTMLElement) || !(debtsTable instanceof HTMLElement)) {
      throw new Error("Payment history or debts table was not rendered");
    }

    expect(paymentButton.compareDocumentPosition(historyHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(historyHeading.compareDocumentPosition(debtsTable) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

  it("opens an in-app popup before deleting a customer instead of using the browser confirm dialog", async () => {
    mounted = await renderCustomersPage();

    await act(async () => {
      findButtonByLabel(mounted!.container, "\u062d\u0630\u0641 \u0627\u0644\u0639\u0645\u064a\u0644").click();
    });

    expect(confirmSpy).not.toHaveBeenCalled();

    const dialog = document.querySelector('[role="dialog"][aria-label="\u062a\u0623\u0643\u064a\u062f \u062d\u0630\u0641 \u0627\u0644\u0639\u0645\u064a\u0644"]');
    if (!(dialog instanceof HTMLElement)) {
      throw new Error("Delete customer confirmation dialog was not rendered");
    }

    await act(async () => {
      findButtonByText(dialog, "\u062d\u0630\u0641").click();
      await Promise.resolve();
    });

    expect(storeMocks.deleteCustomer).toHaveBeenCalledWith("customer-1");
  });
});
