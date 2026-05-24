// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CustomersPage } from "./CustomersPage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const storeMocks = vi.hoisted(() => {
  const debt = {
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

  const invoice = {
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
});
