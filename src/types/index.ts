export type PaymentMethod = "cash" | "debt" | "partial";

export type Product = {
  id: string;
  name: string;
  barcode: string;
  price: number;
  stock: number;
};

export type Debt = {
  id: string;
  invoiceId: string;
  description: string;
  date: string;
  amount: number;
  paid: number;
  remaining: number;
};

export type Customer = {
  id: string;
  name: string;
  phone: string;
  debts: Debt[];
};

export type InvoiceItem = {
  productId: string;
  productName: string;
  barcode: string;
  price: number;
  quantity: number;
  total: number;
};

export type Invoice = {
  id: string;
  number: string;
  date: string;
  customerId?: string;
  customerName?: string;
  items: InvoiceItem[];
  total: number;
  paid: number;
  remaining: number;
  paymentMethod: PaymentMethod;
};

export type ProductInput = {
  name: string;
  barcode: string;
  price: number;
  stock: number;
};

export type CustomerInput = {
  name: string;
  phone: string;
};

export type SaleRequest = {
  items: InvoiceItem[];
  paymentMethod: PaymentMethod;
  customerId?: string;
  paidAmount?: number;
};

export type InvoiceUpdateRequest = {
  items: InvoiceItem[];
};

export type ActionResult = {
  ok: boolean;
  message: string;
  id?: string;
};
