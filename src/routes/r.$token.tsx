import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Droplet } from "lucide-react";
import { fetchSharedReport } from "@/lib/sharing.functions";
import { fmtConsumo, fmtLeitura, fmtM3Total } from "@/lib/utils";
import type { Bloco } from "@/lib/api";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/r/$token")({
  component: SharedReportPage,
});

function SharedReportPage() {
  const { token } = Route.useParams();
  const fetchFn = useServerFn(fetchSharedReport);
  const { data, isLoading, error } = useQuery({
    queryKey: ["shared-report", token],
    queryFn: () => fetchFn({ data: { token } }),
  });

  if (isLoading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando…</div>;
  if (error) return <div className="min-h-screen flex items-center justify-center text-destructive">Erro ao carregar relatório</div>;
  if (!data || data.expired) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="p-8 max-w-md text-center shadow-soft">
          <h1 className="text-xl font-semibold">Link expirado</h1>
          <p className="mt-2 text-sm text-muted-foreground">Este relatório compartilhado não está mais disponível.</p>
        </Card>
      </div>
    );
  }

  const totals: Record<Bloco, number> = { A: 0, B: 0, C: 0, D: 0 };
  let totalGeral = 0;
  for (const r of data.readings) {
    totals[r.bloco as Bloco] += Number(r.consumo_m3);
    totalGeral += Number(r.consumo_m3);
  }
  const byBloco: Record<Bloco, typeof data.readings> = { A: [], B: [], C: [], D: [] };
  for (const r of data.readings) byBloco[r.bloco as Bloco].push(r);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-4xl px-4 py-4 flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-hero text-primary-foreground">
            <Droplet className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-base font-semibold">Terra do Sol — Relatório de consumo</h1>
            <p className="text-xs text-muted-foreground">
              Período: {data.period} · Compartilhado · Válido até {format(new Date(data.expires_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {data.blocos.map((b) => (
            <Card key={b} className="p-4 shadow-soft">
              <p className="text-xs text-muted-foreground">Bloco {b}</p>
              <p className="text-lg font-semibold tabular-nums mt-1">{fmtConsumo(totals[b], b)}</p>
            </Card>
          ))}
        </div>

        <Card className="p-4 shadow-soft">
          <p className="text-xs text-muted-foreground">Total acumulado no período</p>
          <p className="text-2xl font-semibold tabular-nums mt-1">{fmtM3Total(totalGeral)}</p>
        </Card>

        {data.blocos.map((b) => (
          <Card key={b} className="p-4 shadow-soft">
            <h2 className="text-sm font-semibold mb-2">Bloco {b}</h2>
            {byBloco[b].length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem leituras no período.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b">
                      <th className="py-2">Data</th>
                      <th className="py-2 text-right">Leitura</th>
                      <th className="py-2 text-right">Consumo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byBloco[b].map((r) => (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="py-2 whitespace-nowrap">{format(new Date(r.data_hora), "dd/MM/yyyy HH:mm", { locale: ptBR })}</td>
                        <td className="py-2 text-right tabular-nums whitespace-nowrap">{fmtLeitura(r.leitura_atual, b)}</td>
                        <td className="py-2 text-right tabular-nums whitespace-nowrap font-medium">{fmtConsumo(r.consumo_m3, b)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        ))}

        <p className="text-xs text-center text-muted-foreground py-4">
          Relatório somente-leitura · Condomínio Residencial Terra do Sol
        </p>
      </main>
    </div>
  );
}
