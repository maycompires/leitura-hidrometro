import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Bloco } from "@/lib/api";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Formata número removendo zeros decimais desnecessários e pontos de milhar. */
export function fmtNum(value: number | string, maxDecimals = 2) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "0";
  const formatted = n.toLocaleString("pt-BR", { maximumFractionDigits: maxDecimals });
  return formatted.replace(/\./g, "");
}

/**
 * Regra do hidrômetro por bloco:
 * - Blocos A, C, D: os últimos 3 dígitos da leitura representam litros, e os anteriores m³.
 * - Bloco B: os últimos 2 dígitos representam litros, e os anteriores m³.
 */
export const litersDigits = (b: Bloco) => (b === "B" ? 2 : 3);
export const divisorBloco = (b: Bloco) => (b === "B" ? 100 : 1000);

export function rawToParts(raw: number | string, bloco: Bloco) {
  const n = Math.round(Number(raw) || 0);
  const d = divisorBloco(bloco);
  return { m3: Math.trunc(n / d), litros: Math.abs(n) % d };
}

/** Converte leitura bruta (como aparece no hidrômetro) em m³ decimais. */
export function rawToM3(raw: number | string, bloco: Bloco) {
  return (Number(raw) || 0) / divisorBloco(bloco);
}

/** Formata uma leitura bruta como "X m³ YYY L". */
export function fmtLeitura(raw: number | string, bloco: Bloco) {
  const { m3, litros } = rawToParts(raw, bloco);
  return `${fmtNum(m3)} m³ ${String(litros).padStart(litersDigits(bloco), "0")} L`;
}

/** Formata um consumo já em m³ decimais como "X m³ YYY L". */
export function fmtConsumo(value: number | string, bloco: Bloco) {
  const n = Number(value);
  if (!Number.isFinite(n)) return `0 m³ ${"0".padStart(litersDigits(bloco), "0")} L`;
  const d = divisorBloco(bloco);
  const totalL = Math.round(n * d);
  const sign = totalL < 0 ? "-" : "";
  const abs = Math.abs(totalL);
  const m3 = Math.trunc(abs / d);
  const l = abs % d;
  return `${sign}${fmtNum(m3)} m³ ${String(l).padStart(litersDigits(bloco), "0")} L`;
}

/** Formata um total em m³ (sem bloco específico) como "X m³ YYY L" usando milhar. */
export function fmtM3Total(value: number | string) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0 m³ 000 L";
  const totalL = Math.round(n * 1000);
  const sign = totalL < 0 ? "-" : "";
  const abs = Math.abs(totalL);
  const m3 = Math.trunc(abs / 1000);
  const l = abs % 1000;
  return `${sign}${fmtNum(m3)} m³ ${String(l).padStart(3, "0")} L`;
}

/** Formata valor monetário em Reais (R$). */
export function fmtBRL(value: number | string) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "R$ 0,00";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
