import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, tool, stepCountIs, type UIMessage } from "ai";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

type Body = { messages?: UIMessage[]; threadId?: string };

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization") ?? "";
        if (!authHeader.startsWith("Bearer ")) {
          return new Response("Unauthorized", { status: 401 });
        }
        const token = authHeader.slice("Bearer ".length);

        const SUPABASE_URL = process.env.SUPABASE_URL!;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;
        const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
        if (!LOVABLE_API_KEY) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
        });

        const { data: userData, error: userErr } = await supabase.auth.getUser(token);
        if (userErr || !userData.user) return new Response("Unauthorized", { status: 401 });
        const userId = userData.user.id;

        const { messages, threadId } = (await request.json()) as Body;
        if (!Array.isArray(messages) || !threadId) {
          return new Response("Bad Request", { status: 400 });
        }

        // Verify thread belongs to user
        const { data: thread, error: threadErr } = await supabase
          .from("chat_threads")
          .select("id, title")
          .eq("id", threadId)
          .maybeSingle();
        if (threadErr || !thread) return new Response("Thread not found", { status: 404 });

        // Persist the last user message
        const lastUser = [...messages].reverse().find((m) => m.role === "user");
        if (lastUser) {
          const { data: existing } = await supabase
            .from("chat_messages")
            .select("id")
            .eq("thread_id", threadId)
            .eq("role", "user")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          const lastText = lastUser.parts
            .map((p) => (p.type === "text" ? (p as { text: string }).text : ""))
            .join("");
          const existingParts = existing
            ? ((
                await supabase.from("chat_messages").select("parts").eq("id", existing.id).single()
              ).data?.parts as Array<{ type: string; text?: string }> | null)
            : null;
          const existingText =
            existingParts?.map((p) => (p.type === "text" ? p.text ?? "" : "")).join("") ?? "";
          if (!existing || existingText !== lastText) {
            await supabase.from("chat_messages").insert({
              thread_id: threadId,
              role: "user",
              parts: lastUser.parts as unknown as Database["public"]["Tables"]["chat_messages"]["Insert"]["parts"],
            });
            // auto-title from first user message
            if (thread.title === "Nova conversa" && lastText) {
              await supabase
                .from("chat_threads")
                .update({ title: lastText.slice(0, 60) })
                .eq("id", threadId);
            }
          }
        }

        const gateway = createLovableAiGatewayProvider(LOVABLE_API_KEY);
        const model = gateway("google/gemini-3-flash-preview");

        const tools = {
          listarLeituras: tool({
            description:
              "Lista as leituras de hidrômetros do condomínio. Use para responder perguntas sobre consumo recente, leituras de um bloco específico, ou histórico.",
            inputSchema: z.object({
              bloco: z.enum(["A", "B", "C"]).optional().describe("Filtrar por bloco"),
              dias: z.number().int().min(1).max(365).default(30).describe("Quantos dias para trás"),
              limite: z.number().int().min(1).max(200).default(50),
            }),
            execute: async ({ bloco, dias, limite }) => {
              const since = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
              let q = supabase
                .from("readings")
                .select("id, bloco, data_hora, leitura_atual, consumo_m3, observacoes")
                .gte("data_hora", since)
                .order("data_hora", { ascending: false })
                .limit(limite);
              if (bloco) q = q.eq("bloco", bloco);
              const { data, error } = await q;
              if (error) return { error: error.message };
              return { count: data?.length ?? 0, leituras: data ?? [] };
            },
          }),
          estatisticasConsumo: tool({
            description:
              "Retorna estatísticas agregadas de consumo por bloco em um período (total, média diária, número de leituras).",
            inputSchema: z.object({
              dias: z.number().int().min(1).max(365).default(30),
            }),
            execute: async ({ dias }) => {
              const since = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
              const { data, error } = await supabase
                .from("readings")
                .select("bloco, consumo_m3, data_hora")
                .gte("data_hora", since);
              if (error) return { error: error.message };
              const byBloco: Record<string, { total: number; n: number; nNonZero: number }> = {};
              for (const r of data ?? []) {
                const b = r.bloco as string;
                const c = Number(r.consumo_m3);
                if (!byBloco[b]) byBloco[b] = { total: 0, n: 0, nNonZero: 0 };
                byBloco[b].total += c;
                byBloco[b].n += 1;
                if (c > 0) byBloco[b].nNonZero += 1;
              }
              const result = Object.entries(byBloco).map(([bloco, v]) => ({
                bloco,
                total_m3: Number(v.total.toFixed(3)),
                leituras: v.n,
                media_diaria_m3: v.nNonZero > 0 ? Number((v.total / v.nNonZero).toFixed(3)) : 0,
              }));
              return { periodo_dias: dias, blocos: result };
            },
          }),
          alertasRecentes: tool({
            description: "Lista alertas recentes (consumo alto, leitura suspeita) dos hidrômetros.",
            inputSchema: z.object({
              limite: z.number().int().min(1).max(50).default(20),
            }),
            execute: async ({ limite }) => {
              const { data, error } = await supabase
                .from("alerts")
                .select("id, bloco, tipo, severidade, mensagem, created_at")
                .order("created_at", { ascending: false })
                .limit(limite);
              if (error) return { error: error.message };
              return { count: data?.length ?? 0, alertas: data ?? [] };
            },
          }),
        };

        const result = streamText({
          model,
          system: `Você é um assistente do app "Terra do Sol — Controle de Água", um condomínio com 3 blocos (A, B, C) de hidrômetros.
Responda em português brasileiro, de forma clara e amigável.
Use as ferramentas disponíveis para consultar leituras, consumo e alertas reais antes de responder perguntas sobre dados.
Observação importante: o Bloco B usa divisor de 100 (leituras em centenas de litros), os Blocos A e C usam divisor de 1000 (litros).
Quando exibir números, use unidades claras (m³, litros) e formate com 2-3 casas decimais.
Forneça análises, tendências e insights quando possível.`,
          messages: await convertToModelMessages(messages),
          tools,
          stopWhen: stepCountIs(8),
        });

        return result.toUIMessageStreamResponse({
          originalMessages: messages,
          onFinish: async ({ responseMessage }) => {
            try {
              await supabase.from("chat_messages").insert({
                thread_id: threadId,
                role: "assistant",
                parts: responseMessage.parts as unknown as Database["public"]["Tables"]["chat_messages"]["Insert"]["parts"],
              });
            } catch (e) {
              console.error("Failed to persist assistant message", e);
            }
          },
        });
      },
    },
  },
});
