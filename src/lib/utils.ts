import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Formata número removendo zeros decimais desnecessários e pontos de milhar (ex.: 1234.00 -> 1234, 1234.50 -> 1234,5). */
export function fmtNum(value: number | string, maxDecimals = 2) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "0";
  const formatted = n.toLocaleString("pt-BR", { maximumFractionDigits: maxDecimals });
  return formatted.replace(/\./g, "");
}
