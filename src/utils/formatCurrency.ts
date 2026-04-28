const arabicDigits = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];

export const toArabicDigits = (value: string | number) =>
  String(value).replace(/[0-9]/g, (digit) => arabicDigits[Number(digit)]);

export const normalizeDigits = (value: string) =>
  value
    .replace(/[٠-٩]/g, (digit) => String(arabicDigits.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/٫/g, ".")
    .replace(/٬/g, "");

export const formatNumber = (value: number) =>
  toArabicDigits(new Intl.NumberFormat("ar-EG-u-nu-arab", {
    maximumFractionDigits: 0,
  }).format(value));

export const formatCurrency = (value: number) => `\u20AA ${formatNumber(value)}`;

export const formatDate = (value: string) =>
  toArabicDigits(new Intl.DateTimeFormat("ar-EG-u-nu-arab", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value)));
