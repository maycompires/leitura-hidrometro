import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const PeriodSchema = z.enum(["day", "week", "month", "year"]);

function randomToken() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 24);
}

export const createShareLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      period: PeriodSchema,
      blocos: z.array(z.enum(["A", "B", "C", "D"])).min(1),
      validity_days: z.number().int().min(1).max(90),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const token = randomToken();
    const expires = new Date(Date.now() + data.validity_days * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await context.supabase.from("shared_reports").insert({
      token,
      criado_por: context.userId,
      period: data.period,
      blocos: data.blocos,
      expires_at: expires,
    });
    if (error) throw new Error(error.message);
    return { token, expires_at: expires };
  });

function periodStart(p: "day" | "week" | "month" | "year") {
  const now = new Date();
  const d = new Date(now);
  if (p === "day") d.setHours(0, 0, 0, 0);
  else if (p === "week") d.setDate(now.getDate() - 7);
  else if (p === "month") d.setMonth(now.getMonth() - 1);
  else d.setFullYear(now.getFullYear() - 1);
  return d;
}

export const fetchSharedReport = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(8).max(64) }).parse(d))
  .handler(async ({ data }) => {
    const sb = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data: share, error } = await sb
      .from("shared_reports")
      .select("period, blocos, expires_at, created_at")
      .eq("token", data.token)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!share) return { expired: true as const };

    // Load readings for that period via service role (no auth context here)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const start = periodStart(share.period as "day" | "week" | "month" | "year").toISOString();
    const { data: readings, error: e2 } = await supabaseAdmin
      .from("readings")
      .select("id, bloco, data_hora, leitura_atual, leitura_anterior, consumo_m3")
      .gte("data_hora", start)
      .in("bloco", (share.blocos as string[]) as ("A" | "B" | "C" | "D")[])
      .order("data_hora", { ascending: false });
    if (e2) throw new Error(e2.message);
    return {
      expired: false as const,
      period: share.period as "day" | "week" | "month" | "year",
      blocos: share.blocos as ("A" | "B" | "C" | "D")[],
      expires_at: share.expires_at as string,
      readings: readings ?? [],
    };
  });
