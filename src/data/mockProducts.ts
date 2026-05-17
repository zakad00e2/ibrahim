import type { Product } from "../types";

const productFixtures: Array<Omit<Product, "minStock" | "isActive">> = [
  {
    id: "p-1",
    name: "أرز مصري 1 كجم",
    barcode: "622100001001",
    price: 45,
    wholesalePrice: 35,
    stock: 18,
  },
  {
    id: "p-2",
    name: "زيت عباد الشمس 1 لتر",
    barcode: "622100001002",
    price: 82,
    wholesalePrice: 68,
    stock: 4,
  },
  {
    id: "p-3",
    name: "سكر أبيض 1 كجم",
    barcode: "622100001003",
    price: 38,
    wholesalePrice: 29,
    stock: 12,
  },
  {
    id: "p-4",
    name: "شاي ناعم 250 جم",
    barcode: "622100001004",
    price: 64,
    wholesalePrice: 52,
    stock: 7,
  },
  {
    id: "p-5",
    name: "مكرونة 400 جم",
    barcode: "622100001005",
    price: 18,
    wholesalePrice: 12,
    stock: 25,
  },
  {
    id: "p-6",
    name: "لبن كامل الدسم 1 لتر",
    barcode: "622100001006",
    price: 35,
    wholesalePrice: 27,
    stock: 3,
  },
  {
    id: "p-7",
    name: "صلصة طماطم 300 جم",
    barcode: "622100001007",
    price: 22,
    wholesalePrice: 16,
    stock: 0,
  },
  {
    id: "p-8",
    name: "مناديل ورقية",
    barcode: "622100001008",
    price: 16,
    wholesalePrice: 10,
    stock: 14,
  },
];

export const mockProducts: Product[] = productFixtures.map((product) => ({
  ...product,
  minStock: 5,
  isActive: true,
}));
