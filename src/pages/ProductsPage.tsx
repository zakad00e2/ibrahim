import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Camera, ChevronLeft, ChevronRight, PackagePlus, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useMemo } from "react";
import { AnimatedDigits } from "../components/AnimatedDigits";
import { BarcodeScannerModal } from "../components/BarcodeScannerModal";
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";
import { StatusBadge } from "../components/StatusBadge";
import { toUserFacingMessage } from "../services/apiClient";
import { useAppStore } from "../store/AppStore";
import type { Product } from "../types";
import { deriveCartonValues } from "../utils/carton";
import { getStockStatus } from "../utils/calculations";
import { formatCurrency, formatNumber, normalizeDigits, parseLocalizedNumber, toArabicDigits } from "../utils/formatCurrency";

type ProductForm = {
  name: string;
  barcode: string;
  price: string;
  wholesalePrice: string;
  stock: string;
  minStock: string;
  cartonEnabled: boolean;
  piecesPerCarton: string;
  cartonCount: string;
  cartonPurchasePrice: string;
  cartonSalePrice: string;
};

const emptyForm: ProductForm = {
  name: "",
  barcode: "",
  price: "",
  wholesalePrice: "",
  stock: "0",
  minStock: "5",
  cartonEnabled: false,
  piecesPerCarton: "",
  cartonCount: "",
  cartonPurchasePrice: "",
  cartonSalePrice: "",
};

const LIMIT = 20;

export function ProductsPage() {
  const {
    products,
    productsLoading,
    productsError,
    productsQuery,
    productsTotal,
    lowStockCount,
    setProductsQuery,
    refreshLowStock,
    addProduct,
    updateProduct,
    deleteProduct,
  } = useAppStore();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteConfirmProduct, setDeleteConfirmProduct] = useState<Product | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [barcodeScannerOpen, setBarcodeScannerOpen] = useState(false);

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const totalPages = Math.max(1, Math.ceil(productsTotal / LIMIT));
  const currentPage = productsQuery.page;
  const cartonWholesalePreview = useMemo(() => {
    if (!form.cartonEnabled || editingProduct) return null;
    const piecesPerCarton = parseLocalizedNumber(form.piecesPerCarton);
    const cartonPurchasePrice = parseLocalizedNumber(form.cartonPurchasePrice);
    if (piecesPerCarton === null || cartonPurchasePrice === null || !Number.isInteger(piecesPerCarton) || piecesPerCarton <= 0 || cartonPurchasePrice < 0) return null;
    return deriveCartonValues({ cartonCount: 1, piecesPerCarton, cartonPurchasePrice }).wholesalePrice;
  }, [editingProduct, form.cartonEnabled, form.cartonPurchasePrice, form.piecesPerCarton]);

  const handleSearchChange = useCallback(
    (raw: string) => {
      const term = normalizeDigits(raw);

      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }

      searchDebounceRef.current = setTimeout(() => {
        setProductsQuery({ search: term, page: 1 });
      }, 300);
    },
    [setProductsQuery],
  );

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, []);

  const goToPage = (page: number) => {
    setProductsQuery({ page });
  };

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
      wholesalePrice: String(product.wholesalePrice),
      stock: String(product.stock),
      minStock: String(product.minStock),
      cartonEnabled: product.piecesPerCarton !== undefined,
      piecesPerCarton: String(product.piecesPerCarton ?? ""),
      cartonCount: "",
      cartonPurchasePrice: String(product.cartonPurchasePrice ?? ""),
      cartonSalePrice: String(product.cartonSalePrice ?? ""),
    });
    setMessage(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingProduct(null);
    setForm(emptyForm);
    setMessage(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const price = parseLocalizedNumber(form.price);
    const wholesalePrice = parseLocalizedNumber(form.wholesalePrice);
    const stock = parseLocalizedNumber(form.stock || "0");
    const minStock = parseLocalizedNumber(form.minStock || "5");
    const cartonCount = parseLocalizedNumber(form.cartonCount);
    const piecesPerCarton = parseLocalizedNumber(form.piecesPerCarton);
    const cartonPurchasePrice = parseLocalizedNumber(form.cartonPurchasePrice);
    const cartonSalePrice = parseLocalizedNumber(form.cartonSalePrice);

    if (price === null || price < 0) {
      setMessage({ type: "error", text: "أدخل سعر بيع صحيح" });
      return;
    }

    if (stock === null || stock < 0) {
      setMessage({ type: "error", text: "أدخل كمية مخزون صحيحة" });
      return;
    }

    if (minStock === null || minStock < 0) {
      setMessage({ type: "error", text: "أدخل حد تنبيه صحيح" });
      return;
    }

    const isCreatingCartonProduct = form.cartonEnabled && !editingProduct;
    const cartonFieldsValid =
      piecesPerCarton !== null && Number.isInteger(piecesPerCarton) && piecesPerCarton > 0 &&
      cartonPurchasePrice !== null && cartonPurchasePrice >= 0 &&
      cartonSalePrice !== null && cartonSalePrice >= 0;

    if (form.cartonEnabled && !cartonFieldsValid) {
      setMessage({ type: "error", text: "أدخل بيانات كرتونة صحيحة" });
      return;
    }

    if (isCreatingCartonProduct && (cartonCount === null || !Number.isInteger(cartonCount) || cartonCount <= 0)) {
      setMessage({ type: "error", text: "أدخل عدد كراتين صحيح" });
      return;
    }

    const derived = isCreatingCartonProduct
      ? deriveCartonValues({ cartonCount: cartonCount!, piecesPerCarton: piecesPerCarton!, cartonPurchasePrice: cartonPurchasePrice! })
      : null;
    const effectiveWholesalePrice = derived?.wholesalePrice ?? wholesalePrice;

    if (effectiveWholesalePrice === null || effectiveWholesalePrice < 0) {
      setMessage({ type: "error", text: "أدخل سعر جملة صحيح" });
      return;
    }

    const input = {
      name: form.name.trim(),
      barcode: form.barcode.trim(),
      price,
      wholesalePrice: effectiveWholesalePrice,
      stock: derived?.stock ?? stock,
      minStock,
      isActive: true,
      ...(form.cartonEnabled ? {
        piecesPerCarton: piecesPerCarton!,
        cartonPurchasePrice: cartonPurchasePrice!,
        cartonSalePrice: cartonSalePrice!,
        ...(isCreatingCartonProduct ? { cartonCount: cartonCount! } : {}),
      } : {}),
    };

    setSubmitting(true);
    setMessage(null);

    try {
      const result = editingProduct
        ? await updateProduct(editingProduct.id, input)
        : await addProduct(input);

      if (result.ok) {
        closeModal();
        setMessage({ type: "success", text: result.message });
        void refreshLowStock();
      } else {
        setMessage({ type: "error", text: result.message });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (product: Product) => {
    setDeleteConfirmProduct(product);
  };

  const confirmDeleteProduct = async () => {
    const product = deleteConfirmProduct;
    if (!product) return;

    setDeleting(product.id);
    setMessage(null);

    try {
      await deleteProduct(product.id);
      setDeleteConfirmProduct(null);
      setMessage({ type: "success", text: "تم حذف المنتج بنجاح" });
      void refreshLowStock();
    } catch (err) {
      const msg = toUserFacingMessage(err, "تعذر حذف المنتج.");
      setDeleteConfirmProduct(null);
      setMessage({ type: "error", text: msg });
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="font-features-normal space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-zinc-500">عدد المنتجات</p>
          <p className="mt-1 text-2xl font-medium text-zinc-950 sm:text-3xl">
            <AnimatedDigits value={formatNumber(productsTotal)} />
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-zinc-500">منتجات قليلة الكمية</p>
          <p className="mt-1 text-2xl font-medium text-amber-700 sm:text-3xl">
            <AnimatedDigits value={formatNumber(lowStockCount)} />
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-zinc-500">الصفحة الحالية</p>
          <p className="mt-1 text-sm font-medium text-brand-700 sm:text-base">
            <AnimatedDigits value={toArabicDigits(String(currentPage))} /> /{" "}
            <AnimatedDigits value={toArabicDigits(String(totalPages))} />
          </p>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-zinc-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-medium text-zinc-950">قائمة المنتجات</h3>
            <p className="text-sm font-normal text-zinc-500">البيانات من الخادم مع بحث وترقيم صفحات</p>
          </div>
          <Button icon={<Plus className="h-5 w-5" />} onClick={openAddModal}>
            إضافة منتج
          </Button>
        </div>

        <div className="border-b border-zinc-100 px-4 py-3">
          <label className="relative block sm:max-w-sm">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
            <input
              defaultValue={toArabicDigits(productsQuery.search)}
              onChange={(e) => handleSearchChange(e.target.value)}
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

        {productsError ? (
          <div className="mx-4 mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
            {productsError}
          </div>
        ) : null}

        <div className="overflow-x-auto">
          {productsLoading ? (
            <div className="py-12 text-center text-sm font-normal text-zinc-500">جار التحميل...</div>
          ) : (
            <table className="w-full min-w-[860px] text-right text-sm sm:min-w-[980px]">
              <thead className="bg-zinc-50 text-xs font-extrabold text-zinc-500">
                <tr>
                  <th className="px-4 py-3 font-normal">الاسم</th>
                  <th className="px-4 py-3 font-normal">الباركود</th>
                  <th className="px-4 py-3 font-normal">سعر البيع</th>
                  <th className="px-4 py-3 font-normal">سعر الجملة</th>
                  <th className="px-4 py-3 font-normal">الكمية</th>
                  <th className="px-4 py-3 font-normal">حد التنبيه</th>
                  <th className="px-4 py-3 font-normal">الحالة</th>
                  <th className="px-4 py-3 font-normal">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {products.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center font-normal text-zinc-500">
                      لا توجد منتجات مطابقة
                    </td>
                  </tr>
                ) : (
                  products.map((product) => {
                    const status = getStockStatus(product.stock);

                    return (
                      <tr key={product.id}>
                        <td className="px-4 py-3 font-normal text-zinc-950">
                          {toArabicDigits(product.name)}
                        </td>
                        <td className="px-4 py-3 font-normal text-zinc-600">{product.barcode}</td>
                        <td className="px-4 py-3 text-base font-medium text-brand-700 sm:text-lg">
                          <AnimatedDigits value={formatCurrency(product.price)} />
                        </td>
                        <td className="px-4 py-3 text-base font-medium text-zinc-700 sm:text-lg">
                          <AnimatedDigits value={formatCurrency(product.wholesalePrice)} />
                        </td>
                        <td className="px-4 py-3 text-base font-medium text-zinc-950 sm:text-lg">
                          <AnimatedDigits value={formatNumber(product.stock)} />
                        </td>
                        <td className="px-4 py-3 font-normal text-zinc-500">
                          <AnimatedDigits value={toArabicDigits(String(product.minStock))} />
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge className="!font-normal" tone={status.tone} size="sm">
                            {status.label}
                          </StatusBadge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Button
                              className="!font-normal"
                              variant="secondary"
                              size="sm"
                              icon={<Pencil className="h-4 w-4" />}
                              onClick={() => openEditModal(product)}
                            >
                              تعديل
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="حذف المنتج"
                              disabled={deleting === product.id}
                              onClick={() => void handleDelete(product)}
                            >
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
          )}
        </div>

        {totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-3">
            <p className="text-sm font-normal text-zinc-500">
              صفحة <AnimatedDigits value={toArabicDigits(String(currentPage))} /> من{" "}
              <AnimatedDigits value={toArabicDigits(String(totalPages))} /> - إجمالي{" "}
              <AnimatedDigits value={toArabicDigits(String(productsTotal))} /> منتج
            </p>
            <div className="flex items-center gap-2">
              <button
                disabled={currentPage <= 1}
                onClick={() => goToPage(currentPage - 1)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-40"
                aria-label="الصفحة السابقة"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => goToPage(currentPage + 1)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-40"
                aria-label="الصفحة التالية"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <Modal
        open={modalOpen}
        title={editingProduct ? "تعديل منتج" : "إضافة منتج"}
        onClose={closeModal}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button className="!font-normal" variant="secondary" onClick={closeModal} disabled={submitting}>
              إلغاء
            </Button>
            <Button
              className="!font-normal"
              type="submit"
              form="product-form"
              icon={<PackagePlus className="h-5 w-5" />}
              disabled={submitting}
            >
              {submitting ? "جار الحفظ..." : editingProduct ? "حفظ التعديل" : "إضافة المنتج"}
            </Button>
          </div>
        }
      >
        <form id="product-form" className="grid gap-4" onSubmit={(e) => void handleSubmit(e)}>
          <label className="block">
            <span className="mb-2 block text-sm font-normal text-zinc-900">اسم المنتج</span>
            <input
              value={toArabicDigits(form.name)}
              onChange={(e) => setForm((c) => ({ ...c, name: normalizeDigits(e.target.value) }))}
              className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm font-normal outline-none focus:border-brand-600 focus:bg-white focus:ring-4 focus:ring-brand-100"
            />
          </label>

          <div className="block">
            <span className="mb-2 block text-sm font-normal text-zinc-900">الباركود</span>
            <div className="flex gap-2">
              <input
                value={form.barcode}
                onChange={(e) => setForm((c) => ({ ...c, barcode: normalizeDigits(e.target.value) }))}
                className="h-11 flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm font-normal outline-none focus:border-brand-600 focus:bg-white focus:ring-4 focus:ring-brand-100"
              />
              <button
                type="button"
                onClick={() => setBarcodeScannerOpen(true)}
                aria-label="مسح الباركود بالكاميرا"
                className="sm:hidden flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-600 transition hover:bg-zinc-100 active:bg-zinc-200"
              >
                <Camera className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-normal text-zinc-900">سعر البيع</span>
              <input
                type="text"
                inputMode="decimal"
                value={toArabicDigits(form.price)}
                onChange={(e) => setForm((c) => ({ ...c, price: normalizeDigits(e.target.value) }))}
                className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm font-normal outline-none focus:border-brand-600 focus:bg-white focus:ring-4 focus:ring-brand-100"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-normal text-zinc-900">سعر الجملة</span>
              <input
                type="text"
                inputMode="decimal"
                value={toArabicDigits(String(cartonWholesalePreview ?? form.wholesalePrice))}
                readOnly={cartonWholesalePreview !== null}
                onChange={(e) => setForm((c) => ({ ...c, wholesalePrice: normalizeDigits(e.target.value) }))}
                className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm font-normal outline-none focus:border-brand-600 focus:bg-white focus:ring-4 focus:ring-brand-100 read-only:bg-brand-50"
              />
            </label>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <label className="flex items-center justify-between gap-3 text-sm font-normal text-zinc-900">
              <span>بيانات الكرتونة</span>
              <input
                type="checkbox"
                checked={form.cartonEnabled}
                onChange={(e) => setForm((c) => ({ ...c, cartonEnabled: e.target.checked }))}
              />
            </label>
            {form.cartonEnabled ? (
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-normal text-zinc-900">عدد القطع في الكرتونة</span>
                  <input type="text" inputMode="numeric" value={toArabicDigits(form.piecesPerCarton)} onChange={(e) => setForm((c) => ({ ...c, piecesPerCarton: normalizeDigits(e.target.value) }))} className="h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-brand-600 focus:ring-4 focus:ring-brand-100" />
                </label>
                {!editingProduct ? <label className="block">
                  <span className="mb-2 block text-sm font-normal text-zinc-900">عدد الكراتين</span>
                  <input type="text" inputMode="numeric" value={toArabicDigits(form.cartonCount)} onChange={(e) => setForm((c) => ({ ...c, cartonCount: normalizeDigits(e.target.value) }))} className="h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-brand-600 focus:ring-4 focus:ring-brand-100" />
                </label> : null}
                <label className="block">
                  <span className="mb-2 block text-sm font-normal text-zinc-900">سعر شراء الكرتونة</span>
                  <input type="text" inputMode="decimal" value={toArabicDigits(form.cartonPurchasePrice)} onChange={(e) => setForm((c) => ({ ...c, cartonPurchasePrice: normalizeDigits(e.target.value) }))} className="h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-brand-600 focus:ring-4 focus:ring-brand-100" />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-normal text-zinc-900">سعر بيع الكرتونة</span>
                  <input type="text" inputMode="decimal" value={toArabicDigits(form.cartonSalePrice)} onChange={(e) => setForm((c) => ({ ...c, cartonSalePrice: normalizeDigits(e.target.value) }))} className="h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-brand-600 focus:ring-4 focus:ring-brand-100" />
                </label>
                {cartonWholesalePreview !== null ? <p className="sm:col-span-2 rounded-md bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700">سعر جملة القطعة المحسوب: {formatCurrency(cartonWholesalePreview)}</p> : null}
              </div>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-normal text-zinc-900">الكمية</span>
              <input
                type="text"
                inputMode="numeric"
                value={toArabicDigits(form.stock)}
                onChange={(e) => setForm((c) => ({ ...c, stock: normalizeDigits(e.target.value) }))}
                className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm font-normal outline-none focus:border-brand-600 focus:bg-white focus:ring-4 focus:ring-brand-100"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-normal text-zinc-900">حد تنبيه المخزون</span>
              <input
                type="text"
                inputMode="numeric"
                value={toArabicDigits(form.minStock)}
                onChange={(e) => setForm((c) => ({ ...c, minStock: normalizeDigits(e.target.value) }))}
                className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm font-normal outline-none focus:border-brand-600 focus:bg-white focus:ring-4 focus:ring-brand-100"
              />
            </label>
          </div>

          {message?.type === "error" ? (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm font-normal text-red-700">
              {message.text}
            </div>
          ) : null}
        </form>
      </Modal>

      <Modal
        open={deleteConfirmProduct !== null}
        title="تأكيد حذف المنتج"
        onClose={() => {
          if (!deleting) setDeleteConfirmProduct(null);
        }}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              className="!font-normal"
              variant="secondary"
              onClick={() => setDeleteConfirmProduct(null)}
              disabled={deleting !== null}
            >
              إلغاء
            </Button>
            <Button
              className="!font-normal"
              variant="danger"
              icon={<Trash2 className="h-5 w-5" />}
              onClick={() => void confirmDeleteProduct()}
              disabled={deleting !== null}
            >
              {deleting ? "جار الحذف..." : "حذف"}
            </Button>
          </div>
        }
      >
        <div className="space-y-3 text-sm font-normal leading-7 text-zinc-700">
          <p>
            هل تريد حذف المنتج "{toArabicDigits(deleteConfirmProduct?.name ?? "")}" نهائيًا؟
          </p>
          <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">
            لا يمكن التراجع عن هذه العملية بعد التأكيد.
          </p>
        </div>
      </Modal>

      <BarcodeScannerModal
        open={barcodeScannerOpen}
        onDetect={(code) => {
          setForm((c) => ({ ...c, barcode: normalizeDigits(code) }));
          setBarcodeScannerOpen(false);
        }}
        onClose={() => setBarcodeScannerOpen(false)}
      />
    </div>
  );
}
