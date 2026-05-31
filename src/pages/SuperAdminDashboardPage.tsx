import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  Ban,
  CheckCircle2,
  LogOut,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Store,
  UserCheck,
  UsersRound,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { StatusBadge } from "../components/StatusBadge";
import { toUserFacingMessage } from "../services/apiClient";
import {
  approveAdminStore,
  listAdminStores,
  listAdminUsers,
  reactivateAdminStore,
  suspendAdminStore,
} from "../services/adminApi";
import { useAuthStore } from "../store/AuthStore";
import type { AdminStore, AdminUser } from "../types";
import { formatDate, formatNumber } from "../utils/formatCurrency";

type BadgeTone = "success" | "warning" | "danger" | "neutral" | "info";

type AdminStatusMeta = {
  label: string;
  tone: BadgeTone;
};

type AdminDashboardMessage = {
  type: "success" | "error";
  text: string;
};

type AdminStoreStatusActionMeta = {
  kind: "suspend" | "reactivate";
  label: string;
  pendingLabel: string;
  buttonVariant: "danger" | "success";
  errorFallback: string;
};

export const getAdminStoreStatusMeta = (status: string): AdminStatusMeta => {
  switch (status) {
    case "APPROVED":
      return { label: "موافق عليه", tone: "success" };
    case "PENDING":
      return { label: "قيد الانتظار", tone: "warning" };
    case "SUSPENDED":
      return { label: "موقوف", tone: "danger" };
    case "REJECTED":
      return { label: "مرفوض", tone: "danger" };
    default:
      return { label: status || "غير معروف", tone: "neutral" };
  }
};

export const getSuperAdminStoreStats = (stores: AdminStore[]) => ({
  totalStores: stores.length,
  pendingStores: stores.filter((store) => store.status === "PENDING").length,
  approvedStores: stores.filter((store) => store.status === "APPROVED").length,
  totalUsers: stores.reduce((sum, store) => sum + store.counts.users, 0),
  totalProducts: stores.reduce((sum, store) => sum + store.counts.products, 0),
  totalCustomers: stores.reduce((sum, store) => sum + store.counts.customers, 0),
});

export const getAdminStoreStatusActionMeta = (status: string): AdminStoreStatusActionMeta => {
  if (status === "SUSPENDED") {
    return {
      kind: "reactivate",
      label: "إعادة تفعيل",
      pendingLabel: "جار التفعيل",
      buttonVariant: "success",
      errorFallback: "تعذر إعادة تفعيل المتجر.",
    };
  }

  return {
    kind: "suspend",
    label: "تعليق",
    pendingLabel: "جار التعليق",
    buttonVariant: "danger",
    errorFallback: "تعذر تعليق المتجر.",
  };
};

export const getAdminStoreApproveActionLabel = (status: string, isLoading: boolean) => {
  if (isLoading) {
    return "جار الموافقة";
  }

  if (status === "PENDING") {
    return "موافقة";
  }

  if (status === "APPROVED") {
    return "معتمد";
  }

  return getAdminStoreStatusMeta(status).label;
};

export const adminStoreActionHeaderClass = "sticky left-0 z-20 min-w-[20rem] bg-zinc-50 px-4 py-3 font-medium";

export const getAdminStoreActionCellClass = (isSelected: boolean) =>
  [
    "sticky left-0 z-10 min-w-[20rem] px-4 py-3",
    isSelected ? "bg-emerald-50" : "bg-white",
  ].join(" ");

export const adminInlineUsersCellClass = "bg-emerald-50/35 px-4 py-4";

const sortStores = (stores: AdminStore[]) =>
  [...stores].sort((a, b) => {
    if (a.status === "PENDING" && b.status !== "PENDING") return -1;
    if (a.status !== "PENDING" && b.status === "PENDING") return 1;

    return Date.parse(b.createdAt || "") - Date.parse(a.createdAt || "");
  });

export const getNextSelectedAdminStoreId = (currentStoreId: string, stores: AdminStore[]) =>
  currentStoreId && stores.some((store) => store.id === currentStoreId) ? currentStoreId : "";

const displayDate = (value: string) => {
  if (!value) {
    return "-";
  }

  try {
    return formatDate(value);
  } catch {
    return value;
  }
};

type AdminInlineStoreUsersPanelProps = {
  store: AdminStore;
  users: AdminUser[];
  usersLoading: boolean;
  usersError: string | null;
};

export function AdminInlineStoreUsersPanel({
  store,
  users,
  usersLoading,
  usersError,
}: AdminInlineStoreUsersPanelProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <UserCheck className="h-5 w-5 text-emerald-700" />
          <div>
            <h3 className="text-base font-medium text-zinc-950">مستخدمو المتجر</h3>
            <p className="text-sm font-normal text-zinc-500" dir="ltr">
              {store.name}
            </p>
          </div>
        </div>
      </div>

      {usersError ? (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{usersError}</div>
      ) : null}

      {usersLoading ? (
        <div className="py-6 text-center text-sm font-normal text-zinc-500">جار تحميل المستخدمين...</div>
      ) : users.length === 0 ? (
        <div className="py-6 text-center text-sm font-normal text-zinc-500">لا يوجد مستخدمون لهذا المتجر</div>
      ) : (
        <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
          {users.map((user) => (
            <div key={user.id} className="rounded-lg border border-emerald-100 bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-950" dir="ltr">
                    {user.username}
                  </p>
                  <p className="mt-1 truncate text-xs font-normal text-zinc-500" dir="ltr">
                    {user.email ?? "-"}
                  </p>
                </div>
                <StatusBadge tone={user.isActive ? "success" : "danger"} size="sm">
                  {user.isActive ? "نشط" : "معطل"}
                </StatusBadge>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-600">
                <div>
                  <span className="block text-zinc-400">الدور</span>
                  <span className="font-medium">{user.role}</span>
                </div>
                <div>
                  <span className="block text-zinc-400">البريد</span>
                  <span className="font-medium">{user.isEmailVerified ? "مؤكد" : "غير مؤكد"}</span>
                </div>
                <div className="col-span-2">
                  <span className="block text-zinc-400">تاريخ الإنشاء</span>
                  <span className="font-medium">{displayDate(user.createdAt)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function SuperAdminDashboardPage() {
  const navigate = useNavigate();
  const { logout, session } = useAuthStore();
  const [stores, setStores] = useState<AdminStore[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [storesLoading, setStoresLoading] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [approvingStoreId, setApprovingStoreId] = useState<string | null>(null);
  const [statusActionStoreId, setStatusActionStoreId] = useState<string | null>(null);
  const [storesError, setStoresError] = useState<string | null>(null);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [message, setMessage] = useState<AdminDashboardMessage | null>(null);

  const sortedStores = useMemo(() => sortStores(stores), [stores]);
  const stats = useMemo(() => getSuperAdminStoreStats(stores), [stores]);

  const loadStores = useCallback(async () => {
    setStoresLoading(true);
    setStoresError(null);

    try {
      const nextStores = await listAdminStores();
      setStores(nextStores);
      setSelectedStoreId((current) => getNextSelectedAdminStoreId(current, nextStores));
    } catch (err) {
      setStoresError(toUserFacingMessage(err, "تعذر تحميل المتاجر."));
    } finally {
      setStoresLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStores();
  }, [loadStores]);

  useEffect(() => {
    if (!selectedStoreId) {
      setUsers([]);
      return;
    }

    let shouldIgnore = false;
    setUsersLoading(true);
    setUsersError(null);

    listAdminUsers(selectedStoreId)
      .then((nextUsers) => {
        if (!shouldIgnore) {
          setUsers(nextUsers);
        }
      })
      .catch((err: unknown) => {
        if (!shouldIgnore) {
          setUsersError(toUserFacingMessage(err, "تعذر تحميل المستخدمين."));
          setUsers([]);
        }
      })
      .finally(() => {
        if (!shouldIgnore) {
          setUsersLoading(false);
        }
      });

    return () => {
      shouldIgnore = true;
    };
  }, [selectedStoreId]);

  const refreshStoreData = async (storeId: string) => {
    await loadStores();
    if (selectedStoreId === storeId) {
      const nextUsers = await listAdminUsers(storeId);
      setUsers(nextUsers);
    }
  };

  const handleApprove = async (store: AdminStore) => {
    setApprovingStoreId(store.id);
    setMessage(null);

    try {
      const result = await approveAdminStore(store.id);
      setMessage({ type: "success", text: result.message });
      await refreshStoreData(store.id);
    } catch (err) {
      setMessage({
        type: "error",
        text: toUserFacingMessage(err, "تعذر الموافقة على المتجر."),
      });
    } finally {
      setApprovingStoreId(null);
    }
  };

  const handleStoreStatusAction = async (store: AdminStore) => {
    const action = getAdminStoreStatusActionMeta(store.status);
    setStatusActionStoreId(store.id);
    setMessage(null);

    try {
      const result =
        action.kind === "reactivate" ? await reactivateAdminStore(store.id) : await suspendAdminStore(store.id);
      setMessage({ type: "success", text: result.message });
      await refreshStoreData(store.id);
    } catch (err) {
      setMessage({
        type: "error",
        text: toUserFacingMessage(err, action.errorFallback),
      });
    } finally {
      setStatusActionStoreId(null);
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/super-admin-login", { replace: true });
  };

  return (
    <main className="min-h-dvh bg-[#f7f8f6] text-zinc-950">
      <header className="border-b border-zinc-200 bg-white px-3 py-3 sm:px-4 sm:py-4 lg:px-6 xl:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-emerald-700">صلاحيات المنصة</p>
            <h1 className="mt-1 text-2xl font-medium text-zinc-950 sm:text-3xl">لوحة المشرف العام</h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm font-medium text-zinc-700">
              <ShieldCheck className="h-4 w-4 text-emerald-700" />
              <span dir="ltr">{session?.user.username ?? "SUPER_ADMIN"}</span>
            </span>
            <Button variant="secondary" icon={<RefreshCw className="h-4 w-4" />} onClick={() => void loadStores()}>
              تحديث
            </Button>
            <Button variant="ghost" icon={<LogOut className="h-4 w-4" />} onClick={handleLogout}>
              خروج
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-5 px-3 py-4 sm:px-4 sm:py-5 lg:px-6 lg:py-6 xl:px-8 xl:py-7">
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-medium text-zinc-500">إجمالي المتاجر</p>
            <p className="mt-1 text-2xl font-medium text-zinc-950 sm:text-3xl">
              {formatNumber(stats.totalStores)}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-medium text-zinc-500">بانتظار الموافقة</p>
            <p className="mt-1 text-2xl font-medium text-amber-700 sm:text-3xl">
              {formatNumber(stats.pendingStores)}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-medium text-zinc-500">متاجر نشطة</p>
            <p className="mt-1 text-2xl font-medium text-emerald-700 sm:text-3xl">
              {formatNumber(stats.approvedStores)}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-medium text-zinc-500">المستخدمون</p>
            <p className="mt-1 text-2xl font-medium text-zinc-950 sm:text-3xl">
              {formatNumber(stats.totalUsers)}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-medium text-zinc-500">المنتجات</p>
            <p className="mt-1 text-2xl font-medium text-zinc-950 sm:text-3xl">
              {formatNumber(stats.totalProducts)}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-medium text-zinc-500">العملاء</p>
            <p className="mt-1 text-2xl font-medium text-zinc-950 sm:text-3xl">
              {formatNumber(stats.totalCustomers)}
            </p>
          </div>
        </section>

        {message ? (
          <div
            className={[
              "rounded-lg px-3 py-2 text-sm font-medium",
              message.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700",
            ].join(" ")}
          >
            {message.text}
          </div>
        ) : null}

        <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-zinc-100 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Store className="h-5 w-5 text-brand-600" />
                <div>
                  <h2 className="text-lg font-medium text-zinc-950">المتاجر</h2>
                  <p className="text-sm font-normal text-zinc-500">المتاجر الأحدث تظهر أولًا، والمتاجر المعلقة لها أولوية.</p>
                </div>
              </div>
            </div>

            {storesError ? (
              <div className="mx-4 mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                {storesError}
              </div>
            ) : null}

            <div className="overflow-x-auto">
              {storesLoading ? (
                <div className="py-12 text-center text-sm font-normal text-zinc-500">جار تحميل المتاجر...</div>
              ) : (
                <table className="w-full min-w-[980px] text-right text-sm">
                  <thead className="bg-zinc-50 text-xs font-medium text-zinc-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">المتجر</th>
                      <th className="px-4 py-3 font-medium">النطاق</th>
                      <th className="px-4 py-3 font-medium">الخطة</th>
                      <th className="px-4 py-3 font-medium">الحالة</th>
                      <th className="px-4 py-3 font-medium">المستخدمون</th>
                      <th className="px-4 py-3 font-medium">المنتجات</th>
                      <th className="px-4 py-3 font-medium">العملاء</th>
                      <th className="px-4 py-3 font-medium">تاريخ الإنشاء</th>
                      <th className={adminStoreActionHeaderClass}>إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {sortedStores.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-10 text-center font-normal text-zinc-500">
                          لا توجد متاجر بعد
                        </td>
                      </tr>
                    ) : (
                      sortedStores.map((store) => {
                        const status = getAdminStoreStatusMeta(store.status);
                        const statusAction = getAdminStoreStatusActionMeta(store.status);
                        const isSelected = store.id === selectedStoreId;
                        const canApprove = store.status === "PENDING";
                        const isApproveLoading = approvingStoreId === store.id;
                        const isStatusActionLoading = statusActionStoreId === store.id;

                        return (
                          <Fragment key={store.id}>
                            <tr className={isSelected ? "bg-emerald-50/45" : undefined}>
                              <td className="px-4 py-3">
                                <button
                                  type="button"
                                  className="text-right font-medium text-zinc-950 transition hover:text-brand-700"
                                  onClick={() => setSelectedStoreId(store.id)}
                                >
                                  {store.name}
                                </button>
                              </td>
                              <td className="px-4 py-3 font-medium text-zinc-600" dir="ltr">
                                {store.subdomain}
                              </td>
                              <td className="px-4 py-3 font-medium text-zinc-600">{store.plan}</td>
                              <td className="px-4 py-3">
                                <StatusBadge tone={status.tone} size="sm">
                                  {status.label}
                                </StatusBadge>
                              </td>
                              <td className="px-4 py-3 font-medium">{formatNumber(store.counts.users)}</td>
                              <td className="px-4 py-3 font-medium">{formatNumber(store.counts.products)}</td>
                              <td className="px-4 py-3 font-medium">{formatNumber(store.counts.customers)}</td>
                              <td className="px-4 py-3 text-zinc-600">{displayDate(store.createdAt)}</td>
                              <td className={getAdminStoreActionCellClass(isSelected)}>
                                <div className="flex flex-wrap items-center gap-2">
                                  <Button
                                    size="sm"
                                    variant={isSelected ? "primary" : "secondary"}
                                    icon={<UsersRound className="h-4 w-4" />}
                                    onClick={() => setSelectedStoreId((current) => (current === store.id ? "" : store.id))}
                                  >
                                    المستخدمون
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant={canApprove ? "success" : "secondary"}
                                    disabled={!canApprove || isApproveLoading || isStatusActionLoading}
                                    icon={<CheckCircle2 className="h-4 w-4" />}
                                    onClick={() => void handleApprove(store)}
                                  >
                                    {getAdminStoreApproveActionLabel(store.status, isApproveLoading)}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant={statusAction.buttonVariant}
                                    disabled={isStatusActionLoading || isApproveLoading}
                                    icon={
                                      statusAction.kind === "reactivate" ? (
                                        <RotateCcw className="h-4 w-4" />
                                      ) : (
                                        <Ban className="h-4 w-4" />
                                      )
                                    }
                                    onClick={() => void handleStoreStatusAction(store)}
                                  >
                                    {isStatusActionLoading ? statusAction.pendingLabel : statusAction.label}
                                  </Button>
                                </div>
                              </td>
                            </tr>
                            {isSelected ? (
                              <tr>
                                <td colSpan={9} className={adminInlineUsersCellClass}>
                                  <AdminInlineStoreUsersPanel
                                    store={store}
                                    users={users}
                                    usersError={usersError}
                                    usersLoading={usersLoading}
                                  />
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              )}
            </div>
        </section>
      </div>
    </main>
  );
}
