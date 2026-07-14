import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ReadingSchema = z.object({
  bloco: z.enum(["A", "B", "C", "D"]),
  data_hora: z.string(),
  consumo_m3: z.number(),
  leitura_atual: z.number(),
});

export const analyzeConsumption = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      readings: z.array(ReadingSchema).max(2000),
      period: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI não configurada");

    const byBloco: Record<string, { data_hora: string; consumo_m3: number }[]> = {
      A: [], B: [], C: [], D: [],
    };
    for (const r of data.readings) {
      byBloco[r.bloco].push({ data_hora: r.data_hora, consumo_m3: r.consumo_m3 });
    }
    for (const b of Object.keys(byBloco)) {
      byBloco[b].sort((a, c) => new Date(a.data_hora).getTime() - new Date(c.data_hora).getTime());
      // Ignora a primeira leitura de cada bloco (consumo inicial = 0, sem leitura anterior)
      if (byBloco[b].length > 0 && byBloco[b][0].consumo_m3 === 0) {
        byBloco[b] = byBloco[b].slice(1);
      }
    }

    const summary = Object.entries(byBloco).map(([b, arr]) => {
      const vals = arr.map((x) => x.consumo_m3);
      const total = vals.reduce((a, b) => a + b, 0);
      const avg = vals.length ? total / vals.length : 0;
      return { bloco: b, leituras: arr.length, total, media: avg, serie: arr };
    });


    const prompt = `Analise os dados diários de consumo de água (m³) dos 4 blocos do condomínio no período "${data.period}" e identifique MUDANÇAS BRUSCAS de consumo (picos, quedas anormais, padrões fora da média) por bloco.

CONTEXTO DA INSTALAÇÃO HIDRÁULICA (considere na análise):
- Os 4 blocos (A, B, C, D) são abastecidos por uma cisterna comum, que alimenta as caixas d'água de cada bloco.
- APENAS o Bloco A possui alimentação alternativa direto da rua (bypass da cisterna). Portanto:
  * Picos isolados no Bloco A podem indicar uso da alimentação direta da rua (cisterna vazia, manutenção, teste).
  * Quedas simultâneas em A, B, C e D sugerem problema na cisterna (falta de água, falha na bomba, entupimento) e não necessariamente queda real de consumo.
  * Picos simultâneos em todos os blocos podem indicar vazamento na tubulação após a cisterna ou aumento geral de ocupação.
  * Pico isolado em B, C ou D (sem correspondência em A) tende a indicar vazamento localizado ou consumo anormal daquele bloco.

IMPORTANTE: As leituras começaram em 15/06/2026. A primeira leitura de cada bloco já foi removida dos dados (pois tinha consumo zero por não haver leitura anterior). Considere APENAS as leituras fornecidas abaixo, sem mencionar consumos zerados iniciais.

Dados:
${JSON.stringify(summary, null, 2)}

Responda em português, formato Markdown conciso:
- Para cada bloco com anomalia, um item começando com "**Bloco X**:" descrevendo a anomalia (data, valor, % de variação vs média), severidade (alta/média/baixa) e, quando fizer sentido, a provável causa considerando o contexto hidráulico acima (cisterna comum / bypass do Bloco A).
- Se um bloco estiver normal, diga "Bloco X: consumo dentro do esperado".
- Se detectar padrão simultâneo entre blocos, destaque isso (ex.: "queda simultânea em A/B/C/D sugere problema na cisterna").
- Finalize com uma seção "### Recomendações" com ações práticas (verificar vazamento no bloco X, inspecionar cisterna/bomba, conferir se o bypass do Bloco A foi acionado, etc).
- Seja direto, sem enrolação.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Você é um analista de consumo de água especializado em detectar anomalias e vazamentos." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (res.status === 429) throw new Error("Muitas requisições. Tente em instantes.");
    if (res.status === 402) throw new Error("Créditos de IA esgotados.");
    if (!res.ok) throw new Error(`Falha na análise (${res.status})`);

    const json = await res.json();
    const text: string = json?.choices?.[0]?.message?.content ?? "";
    return { analysis: text };
  });
