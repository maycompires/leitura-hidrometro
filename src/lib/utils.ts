import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Formata número removendo zeros decimais desnecessários (ex.: 12.00 -> 12, 12.50 -> 12,5). */
export function fmtNum(value: number | string, maxDecimals = 2) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("pt-BR", { maximumFractionDigits: maxDecimals });
}
