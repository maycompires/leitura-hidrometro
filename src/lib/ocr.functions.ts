import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const readMeterFromImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ imageDataUrl: z.string().min(20).max(15_000_000) }))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI não configurada");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "Você é um especialista em leitura de hidrômetros. Ao receber a foto, identifique APENAS o número inteiro dos dígitos em preto (metros cúbicos), ignorando os dígitos em vermelho (frações de litro). Responda APENAS com um número (sem unidade, sem texto). Se não conseguir ler, responda 'NULL'.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Qual a leitura em m³ deste hidrômetro?" },
              { type: "image_url", image_url: { url: data.imageDataUrl } },
            ],
          },
        ],
      }),
    });

    if (res.status === 429) throw new Error("Muitas requisições. Tente em instantes.");
    if (res.status === 402) throw new Error("Créditos de IA esgotados.");
    if (!res.ok) throw new Error(`Falha no OCR (${res.status})`);

    const json = await res.json();
    const text: string = json?.choices?.[0]?.message?.content ?? "";
    const cleaned = text.replace(/[^\d.,-]/g, "").replace(",", ".");
    const match = cleaned.match(/-?\d+(\.\d+)?/);
    if (!match) return { value: null as number | null, raw: text };
    return { value: Number(match[0]), raw: text };
  });
