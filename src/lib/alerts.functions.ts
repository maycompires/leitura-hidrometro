import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type AlertRow = {
  id: string;
  bloco: string;
  tipo: "consumo_alto" | "possivel_vazamento" | "leitura_atrasada" | "leitura_suspeita";
  severidade: "info" | "aviso" | "critico";
  mensagem: string;
  metadata: Record<string, unknown>;
  reading_id: string | null;
  lido_por: string[];
  resolvido: boolean;
  created_at: string;
};

export const fetchAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("alerts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as AlertRow[];
  });

export const markAlertRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error: e1 } = await context.supabase
      .from("alerts")
      .select("lido_por")
      .eq("id", data.id)
      .single();
    if (e1) throw new Error(e1.message);
    const lido: string[] = (row?.lido_por as string[]) ?? [];
    if (lido.includes(context.userId)) return { ok: true };
    const { error } = await context.supabase
      .from("alerts")
      .update({ lido_por: [...lido, context.userId] })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resolveAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("alerts")
      .update({ resolvido: true })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
