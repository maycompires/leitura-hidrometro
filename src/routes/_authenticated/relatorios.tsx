import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  LineChart, Line,
} from "recharts";
import { Download } from "lucide-react";
import { BLOCOS, fetchReadings, type Bloco, type Reading } from "@/lib/api";
import { toast } from "sonner";
import { fmtNum } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/relatorios")({
  component: ReportsPage,
});

type Period = "day" | "week" | "month" | "year";

function periodStart(p: Period) {
  const now = new Date();
  const d = new Date(now);
  if (p === "day") d.setHours(0, 0, 0, 0);
  else if (p === "week") d.setDate(now.getDate() - 7);
  else if (p === "month") d.setMonth(now.getMonth() - 1);
  else d.setFullYear(now.getFullYear() - 1);
  return d;
}

function groupKey(d: Date, p: Period) {
  if (p === "day") return d.toLocaleTimeString("pt-BR", { hour: "2-digit" });
  if (p === "week" || p === "month") return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return d.toLocaleDateString("pt-BR", { month: "short" });
}

function ReportsPage() {
  const [period, setPeriod] = useState<Period>("month");
  const { data: readings = [] } = useQuery({ queryKey: ["readings"], queryFn: () => fetchReadings() });

  const filtered = useMemo(() => {
    const start = periodStart(period);
    return readings.filter((r) => new Date(r.data_hora) >= start);
  }, [readings, period]);

  const chartData = useMemo(() => {
    const buckets: Record<string, Record<Bloco, number> & { label: string }> = {} as any;
    for (const r of filtered) {
      const k = groupKey(new Date(r.data_hora), period);
      if (!buckets[k]) buckets[k] = { label: k, A: 0, B: 0, C: 0, D: 0 } as any;
      buckets[k][r.bloco] += Number(r.consumo_m3);
    }
    return Object.values(buckets);
  }, [filtered, period]);

  const totals = useMemo(() => {
    const t: Record<Bloco, number> = { A: 0, B: 0, C: 0, D: 0 };
    let total = 0;
    for (const r of filtered) {
      t[r.bloco] += Number(r.consumo_m3);
      total += Number(r.consumo_m3);
    }
    return { byBloco: t, total, media: filtered.length ? total / Math.max(1, daysInPeriod(period)) : 0 };
  }, [filtered, period]);

  const byBlocoSorted = useMemo(() => {
    const map: Record<Bloco, Reading[]> = { A: [], B: [], C: [], D: [] };
    for (const r of filtered) map[r.bloco].push(r);
    for (const b of BLOCOS) {
      map[b].sort((a, c) => new Date(c.data_hora).getTime() - new Date(a.data_hora).getTime());
    }
    return map;
  }, [filtered]);

  const exportCSV = () => {
    const lines: string[][] = [];
    for (const b of BLOCOS) {
      lines.push([`Bloco ${b}`]);
      lines.push(["Data/Hora", "Leitura Atual", "Leitura Anterior", "Consumo (m³)"]);
      for (const r of byBlocoSorted[b]) {
        lines.push([
          new Date(r.data_hora).toLocaleString("pt-BR"),
          String(r.leitura_atual),
          String(r.leitura_anterior),
          String(r.consumo_m3),
        ]);
      }
      lines.push([`Total Bloco ${b}`, "", "", String(totals.byBloco[b])]);
      lines.push([]);
    }
    const csv = lines.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-${period}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado");
  };

  const exportPDF = () => {
    const blocosHtml = BLOCOS.map((b) => `
<section class="bloco">
  <h2>Bloco ${b}</h2>
  <p class="meta">Total: <strong>${fmtNum(totals.byBloco[b])} m³</strong> · ${byBlocoSorted[b].length} leitura(s)</p>
  ${byBlocoSorted[b].length === 0
    ? `<p class="empty">Sem leituras no período.</p>`
    : `<table><thead><tr><th>Data</th><th>Atual</th><th>Anterior</th><th>Consumo (m³)</th></tr></thead><tbody>
${byBlocoSorted[b].map((r) => `<tr><td>${new Date(r.data_hora).toLocaleString("pt-BR")}</td><td>${fmtNum(r.leitura_atual)}</td><td>${fmtNum(r.leitura_anterior)}</td><td>${fmtNum(r.consumo_m3)}</td></tr>`).join("")}
</tbody></table>`}
</section>`).join("");

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Relatório Terra do Sol</title>
<style>
body{font-family:system-ui,sans-serif;padding:32px;color:#1e293b}
h1{color:#0369a1;margin:0 0 4px}
h2{color:#0369a1;margin:0 0 8px;font-size:18px}
.meta{color:#64748b;font-size:13px;margin:0 0 12px}
.empty{color:#94a3b8;font-style:italic}
table{width:100%;border-collapse:collapse;margin-top:8px}
th,td{border:1px solid #e2e8f0;padding:8px;text-align:left;font-size:13px}
th{background:#f1f5f9}
.bloco{margin-top:24px;page-break-inside:avoid}
.bloco + .bloco{page-break-before:always}
.summary{margin-top:16px}
</style></head><body>
<h1>Condomínio Terra do Sol — Relatório de Consumo</h1>
<p class="meta">Período: ${period} · Gerado em ${new Date().toLocaleString("pt-BR")}</p>
<div class="summary">
  <table><thead><tr>${BLOCOS.map((b) => `<th>Bloco ${b}</th>`).join("")}<th>Total Geral</th></tr></thead>
  <tbody><tr>${BLOCOS.map((b) => `<td>${fmtNum(totals.byBloco[b])} m³</td>`).join("")}<td><strong>${fmtNum(totals.total)} m³</strong></td></tr></tbody></table>
</div>
${blocosHtml}
</body></html>`;
    const w = window.open("", "_blank");
    if (!w) return toast.error("Permita pop-ups");
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 500);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Relatórios</h1>
          <p className="text-sm text-muted-foreground">Consumo agregado por bloco</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCSV}><Download className="mr-2 h-4 w-4" />Excel/CSV</Button>
          <Button variant="outline" onClick={exportPDF}><Download className="mr-2 h-4 w-4" />PDF</Button>
        </div>
      </div>

      <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
        <TabsList>
          <TabsTrigger value="day">Hoje</TabsTrigger>
          <TabsTrigger value="week">Semana</TabsTrigger>
          <TabsTrigger value="month">Mês</TabsTrigger>
          <TabsTrigger value="year">Ano</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {BLOCOS.map((b) => (
          <Card key={b} className="p-4 shadow-soft">
            <p className="text-xs text-muted-foreground">Bloco {b}</p>
            <p className="text-2xl font-semibold tabular-nums mt-1">{fmtNum(totals.byBloco[b])}</p>
            <p className="text-xs text-muted-foreground">m³</p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4 shadow-soft">
          <p className="text-xs text-muted-foreground">Total acumulado</p>
          <p className="text-2xl font-semibold tabular-nums mt-1">{fmtNum(totals.total)} m³</p>
        </Card>
        <Card className="p-4 shadow-soft">
          <p className="text-xs text-muted-foreground">Média diária</p>
          <p className="text-2xl font-semibold tabular-nums mt-1">{fmtNum(totals.media)} m³</p>
        </Card>
      </div>

      <Card className="p-4 shadow-soft">
        <h2 className="text-sm font-medium mb-3">Consumo por bloco</h2>
        <div className="h-72 w-full">
          <ResponsiveContainer>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="label" stroke="var(--color-muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--color-popover)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  color: "var(--color-popover-foreground)",
                }}
              />
              <Legend />
              <Bar dataKey="A" fill="var(--color-chart-1)" radius={[4,4,0,0]} />
              <Bar dataKey="B" fill="var(--color-chart-2)" radius={[4,4,0,0]} />
              <Bar dataKey="C" fill="var(--color-chart-3)" radius={[4,4,0,0]} />
              <Bar dataKey="D" fill="var(--color-chart-4)" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}

function daysInPeriod(p: Period) {
  return p === "day" ? 1 : p === "week" ? 7 : p === "month" ? 30 : 365;
}
