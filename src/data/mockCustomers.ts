import type { Customer } from "../types";

const today = new Date().toISOString();
const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

export const mockCustomers: Customer[] = [
  {
    id: "c-1",
    name: "أحمد علي",
    phone: "01012345678",
    debts: [
      {
        id: "d-1",
        invoiceId: "inv-2",
        description: "فاتورة رقم F-1002",
        date: lastWeek,
        amount: 180,
        paid: 50,
        remaining: 130,
      },
      {
        id: "d-2",
        invoiceId: "inv-4",
        description: "فاتورة رقم F-1004",
        date: yesterday,
        amount: 95,
        paid: 0,
        remaining: 95,
      },
    ],
  },
  {
    id: "c-2",
    name: "منى حسن",
    phone: "01198765432",
    debts: [
      {
        id: "d-3",
        invoiceId: "inv-3",
        description: "فاتورة رقم F-1003",
        date: today,
        amount: 120,
        paid: 40,
        remaining: 80,
      },
    ],
  },
  {
    id: "c-3",
    name: "خالد محمود",
    phone: "01255554444",
    debts: [],
  },
];
