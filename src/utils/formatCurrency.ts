const arabicDigits = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];

export const toArabicDigits = (value: string | number) =>
  String(value).replace(/[0-9]/g, (digit) => arabicDigits[Number(digit)]);

export const normalizeDigits = (value: string) =>
  value
    .replace(/[٠-٩]/g, (digit) => String(arabicDigits.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/٫/g, ".")
    .replace(/٬/g, "");

export const parseLocalizedNumber = (value: string): number | null => {
  let normalized = normalizeDigits(value)
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^\d.,-]/g, "");

  if (normalized.includes(",")) {
    if (normalized.includes(".")) {
      normalized = normalized.replace(/,/g, "");
    } else {
      const commaParts = normalized.split(",");

      normalized =
        commaParts.length === 2 && commaParts[1].length > 0 && commaParts[1].length <= 2
          ? `${commaParts[0]}.${commaParts[1]}`
          : normalized.replace(/,/g, "");
    }
  }

  normalized = normalized.replace(/[^\d.-]/g, "");

  if (!normalized || normalized === "." || normalized === "-" || normalized === "-.") {
    return null;
  }

  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
};

export const formatNumber = (value: number) =>
  toArabicDigits(new Intl.NumberFormat("ar-EG-u-nu-arab", {
    maximumFractionDigits: 0,
  }).format(value));

export const formatCurrency = (value: number) =>
  `\u20AA ${toArabicDigits(new Intl.NumberFormat("ar-EG-u-nu-arab", {
    maximumFractionDigits: 2,
  }).format(value))}`;

export const formatDate = (value: string) =>
  toArabicDigits(new Intl.DateTimeFormat("ar-EG-u-nu-arab", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value)));
