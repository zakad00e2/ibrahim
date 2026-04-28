import { useMemo, useState, type FormEvent } from "react";
import { PackagePlus, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { AnimatedDigits } from "../components/AnimatedDigits";
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";
import { StatusBadge } from "../components/StatusBadge";
import { useAppStore } from "../store/AppStore";
import type { Product } from "../types";
import { getStockStatus } from "../utils/calculations";
import { formatCurrency, formatNumber, normalizeDigits, toArabicDigits } from "../utils/formatCurrency";

type ProductForm = {
  name: string;
  barcode: string;
  price: string;
  stock: string;
};

const emptyForm: ProductForm = {
  name: "",
  barcode: "",
  price: "",
  stock: "0",
};

export function ProductsPage() {
  const { products, addProduct, updateProduct, deleteProduct } = useAppStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [search, setSearch] = useState("");

  const totalProducts = products.length;
  const lowStockCount = useMemo(
    () => products.filter((product) => product.stock > 0 && product.stock < 5).length,
    [products],
  );
  const filteredProducts = useMemo(() => {
    const term = normalizeDigits(search).trim().toLowerCase();

    if (!term) {
      return products;
    }

    return products.filter(
      (product) => product.name.toLowerCase().includes(term) || product.barcode.includes(term),
    );
  }, [products, search]);

  const openAddModal = () => {
    setEditingProduct(null);
    setForm(emptyForm);
    setMessage(null);
    setModalOpen(true);
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setForm({
      name: product.name,
      barcode: product.barcode,
      price: String(product.price),
      stock: String(product.stock),
    });
    setMessage(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingProduct(null);
    setForm(emptyForm);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const input = {
      name: form.name,
      barcode: form.barcode,
      price: Number(normalizeDigits(form.price)),
      stock: Number(normalizeDigits(form.stock || "0")),
    };

    const result = editingProduct
      ? updateProduct(editingProduct.id, input)
      : addProduct(input);

    setMessage({ type: result.ok ? "success" : "error", text: result.message });

    if (result.ok) {
      closeModal();
      setMessage({ type: "success", text: result.message });
    }
  };

  const handleDelete = (product: Product) => {
    const confirmed = window.confirm(`هل تريد حذف المنتج "${toArabicDigits(product.name)}"؟`);

    if (!confirmed) {
      return;
    }

    deleteProduct(product.id);
    setMessage({ type: "success", text: "تم حذف المنتج بنجاح" });
  };

  return (
    <div className="font-features-normal space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-zinc-500">عدد المنتجات</p>
          <p className="mt-1 text-2xl font-medium text-zinc-950 sm:text-3xl"><AnimatedDigits value={formatNumber(totalProducts)} /></p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-zinc-500">منتجات قليلة الكمية</p>
          <p className="mt-1 text-2xl font-medium text-amber-700 sm:text-3xl"><AnimatedDigits value={formatNumber(lowStockCount)} /></p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-zinc-500">إدارة محلية</p>
          <p className="mt-1 text-sm font-medium text-brand-700 sm:text-base">React State</p>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-zinc-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-medium text-zinc-950">قائمة المنتجات</h3>
            <p className="text-sm font-normal text-zinc-500">كل العمليات هنا مؤقتة داخل الواجهة فقط</p>
          </div>
          <Button icon={<Plus className="h-5 w-5" />} onClick={openAddModal}>
            إضافة منتج
          </Button>
        </div>

        <div className="border-b border-zinc-100 px-4 py-3">
          <label className="relative block sm:max-w-sm">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
            <input
              value={toArabicDigits(search)}
              onChange={(event) => setSearch(normalizeDigits(event.target.value))}
              placeholder="بحث بالاسم أو الباركود"
              className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2 pr-10 pl-3 text-sm font-normal outline-none focus:border-brand-600 focus:bg-white focus:ring-4 focus:ring-brand-100"
            />
          </label>
        </div>

        {message ? (
          <div
            className={[
              "mx-4 mt-4 rounded-lg px-3 py-2 text-sm font-bold",
              message.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700",
            ].join(" ")}
          >
            {message.text}
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-right text-sm sm:min-w-[860px]">
            <thead className="bg-zinc-50 text-xs font-extrabold text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-normal">الاسم</th>
                <th className="px-4 py-3 font-normal">الباركود</th>
                <th className="px-4 py-3 font-normal">السعر</th>
                <th className="px-4 py-3 font-normal">الكمية المتوفرة</th>
                <th className="px-4 py-3 font-normal">الحالة</th>
                <th className="px-4 py-3 font-normal">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center font-normal text-zinc-500">
                    لا توجد منتجات مطابقة للبحث
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => {
                const status = getStockStatus(product.stock);

                return (
                  <tr key={product.id}>
                    <td className="px-4 py-3 font-normal text-zinc-950">{toArabicDigits(product.name)}</td>
                    <td className="px-4 py-3 font-normal text-zinc-600">{product.barcode}</td>
                    <td className="px-4 py-3 text-base font-medium text-brand-700 sm:text-lg">
                      <AnimatedDigits value={formatCurrency(product.price)} />
                    </td>
                    <td className="px-4 py-3 text-base font-medium text-zinc-950 sm:text-lg">
                      <AnimatedDigits value={formatNumber(product.stock)} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge className="!font-normal" tone={status.tone} size="sm">{status.label}</StatusBadge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Button className="!font-normal" variant="secondary" size="sm" icon={<Pencil className="h-4 w-4" />} onClick={() => openEditModal(product)}>
                          تعديل
                        </Button>
                        <Button variant="ghost" size="icon" aria-label="حذف المنتج" onClick={() => handleDelete(product)}>
                          <Trash2 className="h-5 w-5 text-red-600" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Modal
        open={modalOpen}
        title={editingProduct ? "تعديل منتج" : "إضافة منتج"}
        onClose={closeModal}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button className="!font-normal" variant="secondary" onClick={closeModal}>
              إلغاء
            </Button>
            <Button className="!font-normal" type="submit" form="product-form" icon={<PackagePlus className="h-5 w-5" />}>
              {editingProduct ? "حفظ التعديل" : "إضافة المنتج"}
            </Button>
          </div>
        }
      >
        <form id="product-form" className="grid gap-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-2 block text-sm font-normal text-zinc-900">اسم المنتج</span>
            <input
              value={toArabicDigits(form.name)}
              onChange={(event) => setForm((current) => ({ ...current, name: normalizeDigits(event.target.value) }))}
              className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm font-normal outline-none focus:border-brand-600 focus:bg-white focus:ring-4 focus:ring-brand-100"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-normal text-zinc-900">الباركود</span>
            <input
              value={form.barcode}
              onChange={(event) => setForm((current) => ({ ...current, barcode: normalizeDigits(event.target.value) }))}
              className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm font-normal outline-none focus:border-brand-600 focus:bg-white focus:ring-4 focus:ring-brand-100"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-normal text-zinc-900">السعر</span>
              <input
                type="text"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={toArabicDigits(form.price)}
                onChange={(event) => setForm((current) => ({ ...current, price: normalizeDigits(event.target.value) }))}
                className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm font-normal outline-none focus:border-brand-600 focus:bg-white focus:ring-4 focus:ring-brand-100"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-normal text-zinc-900">الكمية</span>
              <input
                type="text"
                inputMode="numeric"
                min="0"
                value={toArabicDigits(form.stock)}
                onChange={(event) => setForm((current) => ({ ...current, stock: normalizeDigits(event.target.value) }))}
                className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm font-normal outline-none focus:border-brand-600 focus:bg-white focus:ring-4 focus:ring-brand-100"
              />
            </label>
          </div>

          {message?.type === "error" ? (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm font-normal text-red-700">{message.text}</div>
          ) : null}
        </form>
      </Modal>
    </div>
  );
}
