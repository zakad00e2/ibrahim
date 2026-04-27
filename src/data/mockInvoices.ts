import type { Invoice } from "../types";

const makeDate = (dayOffset: number) => {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  return date.toISOString();
};

export const mockInvoices: Invoice[] = [
  {
    id: "inv-1",
    number: "F-1001",
    date: makeDate(0),
    customerName: "بيع مباشر",
    items: [
      {
        productId: "p-1",
        productName: "أرز مصري 1 كجم",
        barcode: "622100001001",
        price: 45,
        quantity: 2,
        total: 90,
      },
      {
        productId: "p-5",
        productName: "مكرونة 400 جم",
        barcode: "622100001005",
        price: 18,
        quantity: 3,
        total: 54,
      },
    ],
    total: 144,
    paid: 144,
    remaining: 0,
    paymentMethod: "cash",
  },
  {
    id: "inv-2",
    number: "F-1002",
    date: makeDate(-7),
    customerId: "c-1",
    customerName: "أحمد علي",
    items: [
      {
        productId: "p-2",
        productName: "زيت عباد الشمس 1 لتر",
        barcode: "622100001002",
        price: 82,
        quantity: 1,
        total: 82,
      },
      {
        productId: "p-4",
        productName: "شاي ناعم 250 جم",
        barcode: "622100001004",
        price: 64,
        quantity: 1,
        total: 64,
      },
      {
        productId: "p-8",
        productName: "مناديل ورقية",
        barcode: "622100001008",
        price: 16,
        quantity: 2,
        total: 32,
      },
    ],
    total: 178,
    paid: 50,
    remaining: 128,
    paymentMethod: "partial",
  },
  {
    id: "inv-3",
    number: "F-1003",
    date: makeDate(0),
    customerId: "c-2",
    customerName: "منى حسن",
    items: [
      {
        productId: "p-6",
        productName: "لبن كامل الدسم 1 لتر",
        barcode: "622100001006",
        price: 35,
        quantity: 2,
        total: 70,
      },
      {
        productId: "p-3",
        productName: "سكر أبيض 1 كجم",
        barcode: "622100001003",
        price: 38,
        quantity: 1,
        total: 38,
      },
    ],
    total: 108,
    paid: 0,
    remaining: 108,
    paymentMethod: "debt",
  },
];
