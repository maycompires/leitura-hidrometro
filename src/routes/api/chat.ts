import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, stepCountIs, tool, type UIMessage } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type ChatBody = { threadId?: string; messages?: UIMessage[] };

const divisorBloco = (b: string) => (b === "B" ? 100 : 1000);

async function buildContext(supabase: ReturnType<typeof createClient<Database>>, userId: string) {
  const { data: readings } = await supabase
    .from("readings")
    .select("bloco, data_hora, leitura_atual, consumo_m3")
    .eq("usuario_id", userId)
    .order("data_hora", { ascending: false })
    .limit(500);
  const rs = readings ?? [];
  const byBloco: Record<string, { total: number; count: number; last?: string }> = {};
  for (const r of rs) {
    const b = String(r.bloco);
    if (!byBloco[b]) byBloco[b] = { total: 0, count: 0 };
    byBloco[b].total += Number(r.consumo_m3);
    byBloco[b].count += 1;
    if (!byBloco[b].last) byBloco[b].last = r.data_hora;
  }
  // diários por bloco últimos 14 dias
  const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const daily: Record<string, Record<string, number>> = { A: {}, B: {}, C: {}, D: {} };
  const sorted = [...rs].sort((a, b) => +new Date(a.data_hora) - +new Date(b.data_hora));
  const lastByDay: Record<string, Record<string, number>> = { A: {}, B: {}, C: {}, D: {} };
  for (const r of sorted) {
    const b = String(r.bloco);
    if (!lastByDay[b]) continue;
    const day = r.data_hora.slice(0, 10);
    lastByDay[b][day] = Number(r.leitura_atual);
  }
  for (const b of ["A", "B", "C", "D"]) {
    const div = divisorBloco(b);
    const days = Object.keys(lastByDay[b]).sort();
    let prev: number | null = null;
    for (const d of days) {
      const cur = lastByDay[b][d];
      const consumo = prev === null ? 0 : Math.max(0, (cur - prev) / div);
      prev = cur;
      if (+new Date(d) >= cutoff && consumo > 0) {
        daily[b][d] = Number(consumo.toFixed(3));
      }
    }
  }
  return { totals: byBloco, ultimos14d: daily, total_leituras: rs.length };
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const auth = request.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
        if (!token) return new Response("Unauthorized", { status: 401 });

        const supabaseUrl = process.env.SUPABASE_URL!;
        const supabasePub = process.env.SUPABASE_PUBLISHABLE_KEY!;
        const supabase = createClient<Database>(supabaseUrl, supabasePub, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
        });
        const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
        if (userErr || !userRes.user) return new Response("Unauthorized", { status: 401 });
        const userId = userRes.user.id;

        const body = (await request.json()) as ChatBody;
        const messages = body.messages ?? [];
        const threadId = body.threadId;
        if (!threadId) return new Response("threadId required", { status: 400 });

        // Verifica dono do thread
        const { data: thread, error: tErr } = await supabase
          .from("chat_threads")
          .select("id, title")
          .eq("id", threadId)
          .single();
        if (tErr || !thread) return new Response("Thread not found", { status: 404 });

        // Persiste a última mensagem do usuário (se ainda não estiver salva)
        const lastUser = [...messages].reverse().find((m) => m.role === "user");
        if (lastUser) {
          await supabase
            .from("chat_messages")
            .insert({ thread_id: threadId, role: "user", parts: lastUser.parts as never });
          // Atualiza título se for a primeira mensagem
          if (messages.filter((m) => m.role === "user").length === 1) {
            const text = lastUser.parts
              .map((p) => (p.type === "text" ? (p as { text: string }).text : ""))
              .join(" ")
              .trim()
              .slice(0, 80);
            if (text) await supabase.from("chat_threads").update({ title: text }).eq("id", threadId);
          }
        }

        const contexto = await buildContext(supabase, userId);

        const system = `Você é uma assistente do app "Terra do Sol — Controle de Água", que gerencia leituras de hidrômetros de 4 blocos (A, B, C, D).
Responda sempre em português do Brasil, de forma clara e objetiva, em markdown quando ajudar.

Você tem acesso aos dados de consumo do usuário logado:
${JSON.stringify(contexto, null, 2)}

Notas:
- Os valores em "totals" e "ultimos14d" estão em m³.
- Para o Bloco B o divisor do hidrômetro é 100; para A, C e D é 1000 (a conversão já foi aplicada).
- Quando o usuário pedir um relatório, PDF, ou para exportar/baixar/imprimir os dados, chame a ferramenta "exportar_relatorio_pdf". Depois confirme em uma frase curta.
- Se não houver dados suficientes para uma análise, diga isso em vez de inventar números.`;

        const gateway = createLovableAiGatewayProvider(apiKey);

        const result = streamText({
          model: gateway("google/gemini-3-flash-preview"),
          system,
          messages: await convertToModelMessages(messages),
          stopWhen: stepCountIs(50),
          tools: {
            exportar_relatorio_pdf: tool({
              description:
                "Dispara a exportação do relatório completo em PDF (gráficos e tabelas) no app. Use quando o usuário pedir um relatório, PDF, exportação ou impressão.",
              inputSchema: z.object({
                observacao: z
                  .string()
                  .optional()
                  .describe("Observação curta opcional para mostrar ao usuário."),
              }),
              execute: async ({ observacao }) => ({
                action: "export_pdf",
                observacao: observacao ?? null,
              }),
            }),
          },
        });

        return result.toUIMessageStreamResponse({
          originalMessages: messages,
          onFinish: async ({ responseMessage }) => {
            try {
              await supabase.from("chat_messages").insert({
                thread_id: threadId,
                role: "assistant",
                parts: responseMessage.parts as never,
              });
              await supabase
                .from("chat_threads")
                .update({ updated_at: new Date().toISOString() })
                .eq("id", threadId);
            } catch (e) {
              console.error("persist assistant message failed", e);
            }
          },
        });
      },
    },
  },
});
