import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/check-stale-readings")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const BLOCOS = ["A", "B", "C", "D"] as const;
        const DEFAULT_DIAS = 7;

        // Get the most aggressive (smallest) threshold among user preferences as the trigger,
        // falling back to default 7 days.
        const { data: prefs } = await supabaseAdmin
          .from("user_preferences")
          .select("dias_sem_leitura");
        const dias = prefs && prefs.length > 0
          ? Math.min(...prefs.map((p: { dias_sem_leitura: number }) => Number(p.dias_sem_leitura)))
          : DEFAULT_DIAS;

        const cutoff = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
        const created: string[] = [];

        for (const bloco of BLOCOS) {
          const { data: last } = await supabaseAdmin
            .from("readings")
            .select("data_hora")
            .eq("bloco", bloco)
            .order("data_hora", { ascending: false })
            .limit(1);
          const lastDate = last?.[0]?.data_hora as string | undefined;
          const isStale = !lastDate || new Date(lastDate) < new Date(cutoff);
          if (!isStale) continue;

          // Avoid duplicate "leitura_atrasada" alert in the past 24h for this bloco
          const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          const { data: existing } = await supabaseAdmin
            .from("alerts")
            .select("id")
            .eq("bloco", bloco)
            .eq("tipo", "leitura_atrasada")
            .gte("created_at", since)
            .limit(1);
          if (existing && existing.length > 0) continue;

          const mensagem = lastDate
            ? `Bloco ${bloco} está há mais de ${dias} dias sem nova leitura (última em ${new Date(lastDate).toLocaleDateString("pt-BR")}).`
            : `Bloco ${bloco} ainda não possui nenhuma leitura registrada.`;
          const { data: ins } = await supabaseAdmin
            .from("alerts")
            .insert({
              bloco,
              tipo: "leitura_atrasada",
              severidade: "aviso",
              mensagem,
              metadata: { dias_limite: dias, ultima_leitura: lastDate ?? null },
            })
            .select("id")
            .single();
          if (ins?.id) created.push(ins.id as string);
        }

        return Response.json({ ok: true, created: created.length, dias });
      },
    },
  },
});
