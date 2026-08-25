export type PaymentMethod = "cash" | "debt" | "partial";

export type SaleUnit = "unit" | "carton";

export type Product = {
  id: string;
  name: string;
  barcode: string;
  price: number;
  wholesalePrice: number;
  stock: number;
  minStock: number;
  isActive: boolean;
  piecesPerCarton?: number;
  cartonPurchasePrice?: number;
  cartonSalePrice?: number;
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

export type CustomerPayment = {
  id: string;
  customerId: string;
  amount: number;
  appliedToDebt: number;
  addedToCredit: number;
  notes?: string;
  paidAt: string;
  reversedAt: string | null;
  clientOperationId: string | null;
};

export type Debt = {
  id: string;
  invoiceId: string;
  invoiceNumber?: string;
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
  creditBalance?: number;
  balance?: number;
  debts: Debt[];
  payment?: CustomerPayment;
};

export type Customer = {
  id: string;
  name: string;
  phone: string;
  debts: Debt[];
  customerPayments?: CustomerPayment[];
  customerPaymentsTotal?: number;
  debtBalance?: number;
  creditBalance?: number;
  balance?: number;
};

export type InvoiceItem = {
  productId: string;
  productName: string;
  barcode: string;
  price: number;
  wholesalePrice: number;
  quantity: number;
  total: number;
  saleUnit?: SaleUnit;
  stockQuantity?: number;
};

export type Invoice = {
  id: string;
  number: string;
  date: string;
  customerId?: string;
  customerName?: string;
  notes?: string;
  items: InvoiceItem[];
  discount?: number;
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
  piecesPerCarton?: number;
  cartonPurchasePrice?: number;
  cartonSalePrice?: number;
  cartonCount?: number;
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
  discount?: number;
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
};

export type AdminStoreStatus = "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED" | string;

export type AdminStoreCounts = {
  users: number;
  products: number;
  customers: number;
};

export type AdminStore = {
  id: string;
  name: string;
  subdomain: string;
  plan: string;
  status: AdminStoreStatus;
  createdAt: string;
  updatedAt: string;
  counts: AdminStoreCounts;
};

export type AdminUserStore = {
  id: string;
  name: string;
  subdomain: string;
  status: AdminStoreStatus;
};

export type AdminUser = {
  id: string;
  username: string;
  email?: string;
  role: string;
  isActive: boolean;
  isEmailVerified: boolean;
  createdAt: string;
  updatedAt: string;
  storeId?: string | null;
  store?: AdminUserStore | null;
};
