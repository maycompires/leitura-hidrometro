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
    }

    const summary = Object.entries(byBloco).map(([b, arr]) => {
      const vals = arr.map((x) => x.consumo_m3);
      const total = vals.reduce((a, b) => a + b, 0);
      const avg = vals.length ? total / vals.length : 0;
      return { bloco: b, leituras: arr.length, total, media: avg, serie: arr };
    });

    const prompt = `Analise os dados diários de consumo de água (m³) dos 4 blocos do condomínio no período "${data.period}" e identifique MUDANÇAS BRUSCAS de consumo (picos, quedas anormais, padrões fora da média) por bloco.

Dados:
${JSON.stringify(summary, null, 2)}

Responda em português, formato Markdown conciso:
- Para cada bloco com anomalia, um item começando com "**Bloco X**:" descrevendo a anomalia (data, valor, % de variação vs média) e severidade (alta/média/baixa).
- Se um bloco estiver normal, diga "Bloco X: consumo dentro do esperado".
- Finalize com uma seção "### Recomendações" com ações práticas (verificar vazamento, conferir leitura, etc).
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
