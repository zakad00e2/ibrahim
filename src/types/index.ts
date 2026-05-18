export type PaymentMethod = "cash" | "debt" | "partial";

export type Product = {
  id: string;
  name: string;
  barcode: string;
  price: number;
  wholesalePrice: number;
  stock: number;
  minStock: number;
  isActive: boolean;
};

export type StoreInfo = {
  id?: string;
  name: string;
  subdomain?: string;
  plan?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type DebtPayment = {
  id: string;
  amount: number;
  date: string;
  notes?: string;
};

export type Debt = {
  id: string;
  invoiceId: string;
  description: string;
  date: string;
  amount: number;
  paid: number;
  remaining: number;
  isPaid?: boolean;
  notes?: string;
  payments?: DebtPayment[];
};

export type DebtSummary = {
  totalDebt: number;
  totalRemaining: number;
  debts: Debt[];
};

export type Customer = {
  id: string;
  name: string;
  phone: string;
  debts: Debt[];
  debtBalance?: number;
};

export type InvoiceItem = {
  productId: string;
  productName: string;
  barcode: string;
  price: number;
  wholesalePrice: number;
  quantity: number;
  total: number;
};

export type Invoice = {
  id: string;
  number: string;
  date: string;
  customerId?: string;
  customerName?: string;
  notes?: string;
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
  wholesalePrice: number;
  stock: number;
  minStock: number;
  isActive?: boolean;
};

export type CustomerInput = {
  name: string;
  phone: string;
  initialDebt?: number;
};

export type SaleRequest = {
  items: InvoiceItem[];
  paymentMethod: PaymentMethod;
  customerId?: string;
  paidAmount?: number;
};

export type InvoiceUpdateRequest = {
  items: InvoiceItem[];
  paymentMethod?: PaymentMethod;
  customerId?: string;
  paid?: number;
  notes?: string;
};

export type ActionResult = {
  ok: boolean;
  message: string;
  id?: string;
};

export type LoginRequest = {
  subdomain: string;
  username: string;
  password: string;
};

export type SuperAdminLoginRequest = {
  username: string;
  password: string;
};

export type RegisterRequest = {
  name: string;
  username: string;
  email: string;
  password: string;
};

export type VerifyEmailRequest = {
  email: string;
  otp: string;
};

export type ResetPasswordRequest = {
  token: string;
  newPassword: string;
};

export type AuthUser = {
  id?: string;
  name?: string;
  username?: string;
  email?: string;
  subdomain?: string;
  role?: string;
  storeId?: string | null;
};

export type AuthSession = {
  token?: string;
  user: AuthUser;
  raw: unknown;
};
