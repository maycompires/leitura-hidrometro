import { createOpenAI } from "@ai-sdk/openai";
import { convertToModelMessages, stepCountIs, streamText, tool, type UIMessage } from "ai";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database, Json } from "@/integrations/supabase/types";
import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayRunId,
  withLovableAiGatewayRunIdHeader,
} from "./run-id.server";

const SYSTEM = `Você é a "Gota", assistente do app de controle de água do Condomínio Residencial Terra do Sol.
Responda sempre em português do Brasil, de forma clara e curta.
Existem 4 hidrômetros: Blocos A, B, C e D. As leituras começaram em 15/06/2026; a primeira leitura de cada bloco tem consumo zero (não é anomalia).
Nos blocos A, C e D os 3 últimos dígitos da leitura são litros (leitura/1000 = m³); no bloco B os 2 últimos (leitura/100 = m³). O campo consumo_m3 já está em m³.
Mostre valores como "X m³ YYY L". Use a ferramenta consultar_leituras para qualquer pergunta sobre consumo, médias, histórico ou comparações — nunca invente números.
Também dê dicas práticas de economia de água quando pedido. Data de hoje: ${"{hoje}"}.`;

function json(status: number, error: string) {
  return new Response(JSON.stringify({ error }), { status, headers: { "content-type": "application/json" } });
}

export async function handleChat(request: Request) {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!url || !key || !apiKey) return json(500, "Configuração do servidor ausente.");

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json(401, "Faça login novamente.");
  const supabase = createClient<Database>(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data: claims, error: authErr } = await supabase.auth.getClaims(token);
  if (authErr || !claims?.claims?.sub) return json(401, "Faça login novamente.");

  let body: { messages?: UIMessage[]; threadId?: string };
  try {
    body = await request.json();
  } catch {
    return json(400, "Pedido inválido.");
  }
  const messages = body.messages;
  const threadId = body.threadId;
  if (!Array.isArray(messages) || !threadId) return json(400, "Pedido inválido.");

  const { data: thread } = await supabase.from("chat_threads").select("id, title").eq("id", threadId).maybeSingle();
  if (!thread) return json(404, "Conversa não encontrada.");

  const tools = {
    consultar_leituras: tool({
      description:
        "Busca leituras dos hidrômetros. Filtre por bloco e período (datas YYYY-MM-DD). Retorna resumo por bloco e as leituras.",
      inputSchema: z.object({
        bloco: z.enum(["A", "B", "C", "D"]).nullable().describe("Bloco, ou null para todos"),
        de: z.string().nullable().describe("Data inicial YYYY-MM-DD ou null"),
        ate: z.string().nullable().describe("Data final YYYY-MM-DD ou null"),
      }),
      execute: async ({ bloco, de, ate }) => {
        let q = supabase
          .from("readings")
          .select("bloco, data_hora, leitura_atual, consumo_m3, observacoes")
          .order("data_hora", { ascending: true })
          .limit(500);
        if (bloco) q = q.eq("bloco", bloco);
        if (de) q = q.gte("data_hora", `${de}T00:00:00`);
        if (ate) q = q.lte("data_hora", `${ate}T23:59:59`);
        const { data, error } = await q;
        if (error) return { erro: "Não foi possível ler os dados." };
        const rows = data ?? [];
        const resumo: Record<string, { leituras: number; total_m3: number; media_diaria_m3: number; maior_m3: number }> = {};
        for (const b of ["A", "B", "C", "D"]) {
          const r = rows.filter((x) => x.bloco === b);
          if (!r.length) continue;
          const cons = r.map((x) => Number(x.consumo_m3) || 0);
          const semInicial = cons.slice(1);
          const total = cons.reduce((a, c) => a + c, 0);
          resumo[b] = {
            leituras: r.length,
            total_m3: +total.toFixed(3),
            media_diaria_m3: semInicial.length ? +(semInicial.reduce((a, c) => a + c, 0) / semInicial.length).toFixed(3) : 0,
            maior_m3: +Math.max(...cons).toFixed(3),
          };
        }
        return {
          resumo,
          leituras: rows.map((x) => ({
            bloco: x.bloco,
            data: x.data_hora.slice(0, 10),
            leitura: x.leitura_atual,
            consumo_m3: Number(x.consumo_m3),
            obs: x.observacoes ?? undefined,
          })),
        };
      },
    }),
  };

  const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(request));
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });

  const result = streamText({
    model: provider.responses("openai/gpt-6-astra"),
    system: SYSTEM.replace("{hoje}", new Date().toISOString().slice(0, 10)),
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(50),
    abortSignal: request.signal,
    providerOptions: {
      openai: {
        forceReasoning: true,
        reasoningEffort: "low",
        reasoningSummary: "auto",
        store: false,
        include: ["reasoning.encrypted_content"],
      },
    },
  });

  const response = result.toUIMessageStreamResponse({
    originalMessages: messages,
    sendReasoning: true,
    onError: (e) => {
      console.error("chat error", e);
      const msg = String((e as { message?: string })?.message ?? "");
      if (msg.includes("402")) return "Créditos de IA esgotados.";
      if (msg.includes("429")) return "Muitas solicitações. Tente em instantes.";
      return "Não foi possível responder agora.";
    },
    onFinish: async ({ messages: all }) => {
      const { error: delErr } = await supabase.from("chat_messages").delete().eq("thread_id", threadId);
      if (delErr) return console.error("chat persist delete", delErr);
      const base = Date.now();
      const rows = all.map((m, i) => ({
        thread_id: threadId,
        role: m.role,
        parts: { id: m.id, parts: m.parts } as unknown as Json,
        created_at: new Date(base + i).toISOString(),
      }));
      const { error: insErr } = await supabase.from("chat_messages").insert(rows);
      if (insErr) console.error("chat persist insert", insErr);
      const upd: { updated_at: string; title?: string } = { updated_at: new Date().toISOString() };
      if (thread.title === "Nova conversa") {
        const first = all.find((m) => m.role === "user");
        const text = first?.parts.find((p) => p.type === "text");
        if (text && "text" in text) upd.title = text.text.slice(0, 60);
      }
      await supabase.from("chat_threads").update(upd).eq("id", threadId);
    },
  });
  return withLovableAiGatewayRunIdHeader(response, runIdFetch);
}
