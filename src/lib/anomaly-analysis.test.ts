import { describe, expect, it } from "vitest";
import { calculateConsumptionAnalysis, type ConsumptionReading } from "./anomaly-analysis";

const reading = (
  data_hora: string,
  consumo_m3: number,
  bloco: ConsumptionReading["bloco"] = "A",
): ConsumptionReading => ({ bloco, data_hora, consumo_m3, leitura_atual: 0 });

describe("calculateConsumptionAnalysis", () => {
  it("ignora somente o zero inicial e sinaliza consumo acima de 30% da média", () => {
    const result = calculateConsumptionAnalysis([
      reading("2026-06-15T12:00:00Z", 0),
      reading("2026-06-16T12:00:00Z", 1),
      reading("2026-06-17T12:00:00Z", 1),
      reading("2026-06-18T12:00:00Z", 3),
    ]);

    expect(result.summaries[0]).toMatchObject({ leituras: 3, total: 5, media: 5 / 3 });
    expect(result.anomalies).toHaveLength(1);
    expect(result.anomalies[0]).toMatchObject({ consumo_m3: 3, percentual_acima: 80 });
  });

  it("mantém zeros legítimos posteriores na média", () => {
    const result = calculateConsumptionAnalysis([
      reading("2026-06-15T12:00:00Z", 0),
      reading("2026-06-16T12:00:00Z", 0),
      reading("2026-06-17T12:00:00Z", 2),
    ]);

    expect(result.summaries[0]).toMatchObject({ leituras: 2, media: 1 });
    expect(result.anomalies[0]?.percentual_acima).toBe(100);
  });

  it("não sinaliza valor exatamente 30% acima da média", () => {
    const result = calculateConsumptionAnalysis([
      reading("2026-06-16T12:00:00Z", 0.7),
      reading("2026-06-17T12:00:00Z", 1.3),
    ]);

    expect(result.summaries[0].media).toBe(1);
    expect(result.anomalies).toHaveLength(0);
  });
});