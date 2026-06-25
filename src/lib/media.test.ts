import { describe, it, expect } from "vitest";
import {
  mediaIgnorandoZeroInicial,
  mediaIncluindoZeros,
  type DailyEntry,
} from "./media";

const d = (label: string, consumo: number): DailyEntry => ({ label, consumo });

describe("mediaIgnorandoZeroInicial", () => {
  it("retorna 0 para lista vazia", () => {
    expect(mediaIgnorandoZeroInicial([])).toBe(0);
  });

  it("retorna 0 quando só existe a leitura inicial", () => {
    expect(mediaIgnorandoZeroInicial([d("15/06", 0)])).toBe(0);
  });

  it("ignora a primeira leitura mesmo se ela for diferente de zero", () => {
    // (20 + 30) / 2 = 25, descartando o 999 inicial
    const vals = [d("15/06", 999), d("16/06", 20), d("17/06", 30)];
    expect(mediaIgnorandoZeroInicial(vals)).toBe(25);
  });

  it("considera zeros legítimos após a primeira leitura", () => {
    // descarta o primeiro zero; calcula sobre [10, 0, 20] => 30/3 = 10
    const vals = [d("15/06", 0), d("16/06", 10), d("17/06", 0), d("18/06", 20)];
    expect(mediaIgnorandoZeroInicial(vals)).toBe(10);
  });

  it("calcula corretamente sequência típica do Bloco D iniciando em 15/06", () => {
    // Leitura inicial em 15/06 (consumo 0) + dias seguintes
    const vals = [
      d("15/06", 0),
      d("16/06", 1.2),
      d("17/06", 0.8),
      d("18/06", 1.0),
    ];
    expect(mediaIgnorandoZeroInicial(vals)).toBeCloseTo(1.0, 5);
  });

  it("lida com séries longas de consumo constante", () => {
    const vals = [d("d0", 0), ...Array.from({ length: 10 }, (_, i) => d(`d${i + 1}`, 5))];
    expect(mediaIgnorandoZeroInicial(vals)).toBe(5);
  });
});

describe("mediaIncluindoZeros", () => {
  it("retorna 0 para lista vazia", () => {
    expect(mediaIncluindoZeros([])).toBe(0);
  });

  it("inclui a primeira leitura zerada no cálculo", () => {
    // (0 + 10 + 20) / 3
    const vals = [d("15/06", 0), d("16/06", 10), d("17/06", 20)];
    expect(mediaIncluindoZeros(vals)).toBeCloseTo(10, 5);
  });

  it("difere de mediaIgnorandoZeroInicial quando há zero inicial", () => {
    const vals = [d("15/06", 0), d("16/06", 30), d("17/06", 30)];
    expect(mediaIncluindoZeros(vals)).toBe(20);
    expect(mediaIgnorandoZeroInicial(vals)).toBe(30);
  });

  it("considera todos os zeros (inicial e legítimos)", () => {
    const vals = [d("15/06", 0), d("16/06", 0), d("17/06", 12)];
    expect(mediaIncluindoZeros(vals)).toBe(4);
  });

  it("é igual à mediaIgnorandoZeroInicial quando não há leitura inicial extra", () => {
    // Caso degenerado: comparar comportamentos com 1 único registro não-zero
    const vals = [d("15/06", 7)];
    expect(mediaIncluindoZeros(vals)).toBe(7);
    expect(mediaIgnorandoZeroInicial(vals)).toBe(0);
  });
});
