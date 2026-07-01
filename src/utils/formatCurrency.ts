const arabicDigits = ["\u0660", "\u0661", "\u0662", "\u0663", "\u0664", "\u0665", "\u0666", "\u0667", "\u0668", "\u0669"];

export const toArabicDigits = (value: string | number) =>
  String(value).replace(/[0-9]/g, (digit) => arabicDigits[Number(digit)]);

export const normalizeDigits = (value: string) =>
  value
    .replace(/[\u0660-\u0669]/g, (digit) => String(arabicDigits.indexOf(digit)))
    .replace(/[\u06f0-\u06f9]/g, (digit) => String("\u06f0\u06f1\u06f2\u06f3\u06f4\u06f5\u06f6\u06f7\u06f8\u06f9".indexOf(digit)))
    .replace(/\u066b/g, ".")
    .replace(/\u066c/g, "");

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

export const formatPrintAmount = (value: number) =>
  toArabicDigits(new Intl.NumberFormat("ar-EG-u-nu-arab", {
    maximumFractionDigits: 2,
  }).format(value));

const missingDateLabel = "\u063a\u064a\u0631 \u0645\u062a\u0648\u0641\u0631";

export const formatDate = (value: string | null | undefined) => {
  const date = value ? new Date(value) : null;

  if (!date || Number.isNaN(date.getTime())) {
    return missingDateLabel;
  }

  return toArabicDigits(new Intl.DateTimeFormat("ar-EG-u-nu-arab", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date));
};
