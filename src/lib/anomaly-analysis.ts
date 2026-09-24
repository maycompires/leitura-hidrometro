export type ConsumptionReading = {
  bloco: "A" | "B" | "C" | "D";
  data_hora: string;
  consumo_m3: number;
  leitura_atual: number;
};

export type ConsumptionAnomaly = {
  bloco: ConsumptionReading["bloco"];
  data_hora: string;
  consumo_m3: number;
  media_m3: number;
  percentual_acima: number;
};

export type BlockConsumptionSummary = {
  bloco: ConsumptionReading["bloco"];
  leituras: number;
  total: number;
  media: number;
  serie: Array<{ data_hora: string; consumo_m3: number }>;
};

const BLOCOS: ConsumptionReading["bloco"][] = ["A", "B", "C", "D"];

export function calculateConsumptionAnalysis(readings: ConsumptionReading[]) {
  const grouped: Record<ConsumptionReading["bloco"], ConsumptionReading[]> = {
    A: [],
    B: [],
    C: [],
    D: [],
  };

  for (const reading of readings) grouped[reading.bloco].push(reading);

  const summaries: BlockConsumptionSummary[] = BLOCOS.map((bloco) => {
    const ordered = [...grouped[bloco]].sort(
      (a, b) => new Date(a.data_hora).getTime() - new Date(b.data_hora).getTime(),
    );
    const valid = ordered[0]?.consumo_m3 === 0 ? ordered.slice(1) : ordered;
    const serie = valid.map(({ data_hora, consumo_m3 }) => ({ data_hora, consumo_m3 }));
    const total = serie.reduce((sum, item) => sum + item.consumo_m3, 0);
    const media = serie.length ? total / serie.length : 0;
    return { bloco, leituras: serie.length, total, media, serie };
  });

  const anomalies: ConsumptionAnomaly[] = summaries.flatMap((summary) => {
    if (summary.media <= 0) return [];
    return summary.serie
      .filter((item) => item.consumo_m3 > summary.media * 1.3)
      .map((item) => ({
        bloco: summary.bloco,
        data_hora: item.data_hora,
        consumo_m3: item.consumo_m3,
        media_m3: summary.media,
        percentual_acima: ((item.consumo_m3 - summary.media) / summary.media) * 100,
      }));
  });

  return { summaries, anomalies };
}