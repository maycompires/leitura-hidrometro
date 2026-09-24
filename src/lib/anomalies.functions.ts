import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { calculateConsumptionAnalysis } from "@/lib/anomaly-analysis";

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
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI não configurada");

    const { summaries, anomalies } = calculateConsumptionAnalysis(data.readings);
    const generatedAt = new Date().toISOString();

    const prompt = `Redija um relatório técnico profissional, em português brasileiro, sobre o consumo diário de água dos quatro blocos do Condomínio Residencial Terra do Sol no período "${data.period}".

O documento deve ter redação formal, objetiva e impessoal, inspirada na estrutura acadêmica da ABNT. Use EXATAMENTE estes títulos Markdown, nesta ordem:
# RELATÓRIO TÉCNICO DE ANÁLISE DO CONSUMO DE ÁGUA
## 1 RESUMO EXECUTIVO
## 2 METODOLOGIA
## 3 RESULTADOS POR BLOCO
### 3.1 Bloco A
### 3.2 Bloco B
### 3.3 Bloco C
### 3.4 Bloco D
## 4 ANOMALIAS SUPERIORES A 30% DA MÉDIA
## 5 DICAS E RECOMENDAÇÕES
## 6 OBSERVAÇÕES TÉCNICAS
## 7 CONCLUSÃO

REGRA OBJETIVA E OBRIGATÓRIA:
- As anomalias já foram calculadas pelo sistema. Considere como anomalia elevada somente uma leitura estritamente superior a 130% da média do próprio bloco.
- Não invente datas, valores, percentuais nem anomalias. Reproduza os números fornecidos.
- Na seção 4, liste cada anomalia com bloco, data, consumo, média e percentual acima da média.
- Se a lista estiver vazia, declare que nenhuma leitura excedeu o limite de 30%.
- Inclua dicas práticas na seção 5 e ressalvas de interpretação na seção 6.
- Não mencione normas específicas que não tenham sido verificadas; use apenas a estrutura solicitada.

CONTEXTO DA INSTALAÇÃO HIDRÁULICA (considere na análise):
- Os 4 blocos (A, B, C, D) são abastecidos por uma cisterna comum, que alimenta as caixas d'água de cada bloco.
- APENAS o Bloco A possui alimentação alternativa direto da rua (bypass da cisterna). Portanto:
  * Picos isolados no Bloco A podem indicar uso da alimentação direta da rua (cisterna vazia, manutenção, teste).
  * Quedas simultâneas em A, B, C e D sugerem problema na cisterna (falta de água, falha na bomba, entupimento) e não necessariamente queda real de consumo.
  * Picos simultâneos em todos os blocos podem indicar vazamento na tubulação após a cisterna ou aumento geral de ocupação.
  * Pico isolado em B, C ou D (sem correspondência em A) tende a indicar vazamento localizado ou consumo anormal daquele bloco.

OCUPAÇÃO E ÁREAS COMUNS (use para ponderar se o consumo está proporcional):
- Bloco A: cerca de 10 apartamentos ocupados.
- Bloco B: cerca de 8 apartamentos ocupados.
- Bloco C: cerca de 6 apartamentos ocupados.
- Bloco D: cerca de 7 apartamentos ocupados.
- Bloco C: o consumo costuma ser mais alto porque compartilha áreas comuns com banheiros, ducha de piscina e salão de festas. Portanto, uma média maior no Bloco C pode ser esperada e não necessariamente indica vazamento.
- Calcule e mencione consumo médio por apartamento ocupado aproximado quando ajudar a comparar blocos.

IMPORTANTE: As leituras começaram em 15/06/2026. A primeira leitura de cada bloco já foi removida dos dados (pois tinha consumo zero por não haver leitura anterior). Considere APENAS as leituras fornecidas abaixo, sem mencionar consumos zerados iniciais.

RESUMOS CALCULADOS PELO SISTEMA:
${JSON.stringify(summaries, null, 2)}

ANOMALIAS CONFIRMADAS PELO LIMITE DE 30%:
${JSON.stringify(anomalies, null, 2)}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        input: prompt,
        stream: true,
        reasoning: { effort: "medium", summary: "auto" },
        include: ["reasoning.encrypted_content"],
        store: false,
      }),
    });

    if (!res.ok) {
      let message = `Não foi possível gerar o relatório (${res.status}).`;
      try {
        const error = (await res.json()) as { message?: string; error?: { message?: string } };
        message = error.message ?? error.error?.message ?? message;
      } catch {
        // Mantém a mensagem segura baseada no status quando não houver JSON.
      }
      throw new Error(message);
    }

    if (!res.body) throw new Error("O serviço de IA não retornou conteúdo.");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";
      for (const event of events) {
        for (const line of event.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);
          if (payload === "[DONE]") continue;
          try {
            const parsed = JSON.parse(payload) as { type?: string; delta?: string };
            if (parsed.type === "response.output_text.delta" && parsed.delta) text += parsed.delta;
          } catch {
            // Eventos SSE auxiliares não afetam o texto final.
          }
        }
      }
    }
    if (!text.trim()) throw new Error("A análise foi concluída sem texto para exibição.");
    return { analysis: text.trim(), anomalies, summaries, generatedAt };
  });
