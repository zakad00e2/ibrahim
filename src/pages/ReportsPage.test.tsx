// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStoreDebtSummary } from "../services/debtsApi";
import { getDailyProfit, getDailySales, type DailySalesSummary } from "../services/reportsApi";
import { loadReportsDataset, type ReportsDataset } from "../services/reportsData";
import { ReportsPage } from "./ReportsPage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../components/AnimatedDigits", () => ({
  AnimatedDigits: ({ value }: { value: string }) => <span>{value}</span>,
}));

vi.mock("../services/debtsApi", () => ({
  getStoreDebtSummary: vi.fn(),
}));

vi.mock("../services/reportsApi", () => ({
  getDailyProfit: vi.fn(),
  getDailySales: vi.fn(),
}));

vi.mock("../services/reportsData", () => ({
  loadReportsDataset: vi.fn(),
}));

const resolvedDataset: ReportsDataset = { products: [], invoices: [] };

const flushPromises = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

const renderReports = async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<ReportsPage />);
  });

  return { container, root };
};

const unmount = async ({ container, root }: { container: HTMLElement; root: Root }) => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
};

const cardText = (container: HTMLElement, label: string): string => {
  const heading = Array.from(container.querySelectorAll("p")).find((element) => element.textContent === label);
  const card = heading?.closest(".min-h-28");
  if (!card) throw new Error(`report card not found: ${label}`);
  return card.textContent ?? "";
};

const mockResolvedSummaries = () => {
  vi.mocked(getDailyProfit).mockResolvedValue({
    date: "2026-08-14",
    totalRevenue: 314,
    totalCost: 200,
    netProfit: 114,
  });
  vi.mocked(getDailySales).mockResolvedValue({
    date: "2026-08-14",
    invoiceCount: 3,
    totalSales: 314,
    totalPaid: 84,
    totalCash: 0,
    totalOnline: 0,
    totalDebt: 230,
  });
  vi.mocked(getStoreDebtSummary).mockResolvedValue({
    totalDebts: 115,
    totalAmount: 11316,
    totalPaid: 1430,
    totalRemaining: 9886,
    unpaidCount: 87,
    unpaidRemaining: 9886,
  });
  vi.mocked(loadReportsDataset).mockResolvedValue(resolvedDataset);
};

describe("ReportsPage summary cards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolvedSummaries();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders debt and invoice count from aggregate summaries without waiting for tables", async () => {
    let resolveTables!: (value: ReportsDataset) => void;
    vi.mocked(loadReportsDataset).mockReturnValue(new Promise((resolve) => {
      resolveTables = resolve;
    }));

    const view = await renderReports();
    await flushPromises();

    expect(cardText(view.container, "إجمالي الديون")).toContain("٩٬٨٨٦");
    expect(cardText(view.container, "عدد فواتير اليوم")).toContain("٣");

    await act(async () => {
      resolveTables(resolvedDataset);
    });
    await unmount(view);
  });

  it("does not replace a failed debt summary with a false zero", async () => {
    vi.mocked(getStoreDebtSummary).mockRejectedValue(new Error("network down"));

    const view = await renderReports();
    await flushPromises();

    const debtCard = cardText(view.container, "إجمالي الديون");
    expect(debtCard).toContain("—");
    expect(debtCard).not.toContain("₪ ٠");
    await unmount(view);
  });

  it("keeps the newest selected-date invoice count when an older request resolves late", async () => {
    let resolveOld!: (value: DailySalesSummary) => void;
    let resolveNew!: (value: DailySalesSummary) => void;
    vi.mocked(getDailySales)
      .mockReset()
      .mockReturnValueOnce(new Promise((resolve) => {
        resolveOld = resolve;
      }))
      .mockReturnValueOnce(new Promise((resolve) => {
        resolveNew = resolve;
      }));

    const view = await renderReports();
    const dateInput = view.container.querySelector<HTMLInputElement>("#report-date");
    if (!dateInput) throw new Error("report date input not found");

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      if (!valueSetter) throw new Error("date input value setter not found");
      valueSetter.call(dateInput, "2026-08-13");
      dateInput.dispatchEvent(new Event("input", { bubbles: true }));
      dateInput.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => {
      resolveNew({
        date: "2026-08-13",
        invoiceCount: 7,
        totalSales: 700,
        totalPaid: 700,
        totalCash: 700,
        totalOnline: 0,
        totalDebt: 0,
      });
    });
    await act(async () => {
      resolveOld({
        date: "2026-08-14",
        invoiceCount: 3,
        totalSales: 314,
        totalPaid: 84,
        totalCash: 0,
        totalOnline: 0,
        totalDebt: 230,
      });
    });

    const invoiceCard = cardText(view.container, "عدد فواتير اليوم المختار");
    expect(invoiceCard).toContain("٧");
    expect(invoiceCard).not.toContain("٣");
    await unmount(view);
  });
});
