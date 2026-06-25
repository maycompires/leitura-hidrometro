// Helpers puros para cálculo de média de consumo diário por bloco.
// Mantidos isolados para facilitar testes unitários.

export type DailyEntry = { label: string; consumo: number };

/**
 * Calcula a média de consumo diário ignorando a PRIMEIRA leitura
 * (que sempre tem consumo zero por não ter leitura anterior).
 * Os demais dias entram no cálculo mesmo quando o consumo for zero.
 */
export function mediaIgnorandoZeroInicial(daily: DailyEntry[]): number {
  const vals = daily.slice(1).map((d) => d.consumo);
  if (!vals.length) return 0;
  return vals.reduce((a, c) => a + c, 0) / vals.length;
}

/**
 * Calcula a média de consumo diário incluindo todos os dias,
 * inclusive a primeira leitura (consumo zero inicial).
 */
export function mediaIncluindoZeros(daily: DailyEntry[]): number {
  if (!daily.length) return 0;
  return daily.reduce((a, c) => a + c.consumo, 0) / daily.length;
}
