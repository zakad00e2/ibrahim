type StatusBadgeProps = {
  tone?: "success" | "warning" | "danger" | "neutral" | "info";
  size?: "sm" | "md";
  children: string;
};

const toneClasses = {
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  warning: "bg-amber-50 text-amber-800 ring-amber-200",
  danger: "bg-red-50 text-red-700 ring-red-200",
  neutral: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  info: "bg-sky-50 text-sky-700 ring-sky-200",
};

const sizeClasses = {
  sm: "px-2 py-0.5 text-[11px]",
  md: "px-2.5 py-1 text-xs",
};

export function StatusBadge({ tone = "neutral", size = "md", children }: StatusBadgeProps) {
  return (
    <span className={`inline-flex items-center justify-center rounded-full text-center font-bold leading-none ring-1 ${sizeClasses[size]} ${toneClasses[tone]}`}>
      {children}
    </span>
  );
}
