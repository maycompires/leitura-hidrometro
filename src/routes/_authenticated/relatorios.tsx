import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  LineChart, Line, ReferenceLine,
} from "recharts";
import { Download, Sparkles, Loader2 } from "lucide-react";
import { AnalysisReport } from "@/components/AnalysisReport";
import { BLOCOS, fetchReadings, type Bloco, type Reading } from "@/lib/api";
import { analyzeConsumption } from "@/lib/anomalies.functions";
import { toast } from "sonner";
import { fmtLeitura, fmtConsumo, fmtM3Total, divisorBloco } from "@/lib/utils";
import { mediaIgnorandoZeroInicial, mediaIncluindoZeros } from "@/lib/media";

export const Route = createFileRoute("/_authenticated/relatorios")({
  component: ReportsPage,
});

type Period = "day" | "week" | "month" | "year";

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function groupKey(d: Date, p: Period) {
  if (p === "day") return d.toLocaleTimeString("pt-BR", { hour: "2-digit" });
  if (p === "week" || p === "month") return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return d.toLocaleDateString("pt-BR", { month: "short" });
}

export function ReportsPage() {
  const [period, setPeriod] = useState<Period>("month");
  const [analysis, setAnalysis] = useState<string>("");
  const [analyzing, setAnalyzing] = useState(false);
  const [incluirZeros, setIncluirZeros] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string>(() => monthKey(new Date()));
  const runAnalysis = useServerFn(analyzeConsumption);
  const { data: readings = [] } = useQuery({ queryKey: ["readings"], queryFn: () => fetchReadings() });

  // Meses disponíveis: do primeiro mês com leitura até o mês atual.
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    for (const r of readings) set.add(monthKey(new Date(r.data_hora)));
    set.add(monthKey(new Date()));
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [readings]);

  const filtered = useMemo(() => {
    // Ano: todas as leituras (ignora o mês selecionado).
    if (period === "year") return readings;

    // Restringe ao mês selecionado.
    const [y, m] = selectedMonth.split("-").map(Number);
    const monthStart = new Date(y, m - 1, 1, 0, 0, 0, 0);
    const monthEnd = new Date(y, m, 1, 0, 0, 0, 0);
    const inMonth = readings.filter((r) => {
      const d = new Date(r.data_hora);
      return d >= monthStart && d < monthEnd;
    });

    if (period === "month") return inMonth;

    // Referência = hoje se estiver no mês selecionado, senão último dia do mês.
    const now = new Date();
    const ref = now >= monthStart && now < monthEnd ? now : new Date(y, m, 0, 23, 59, 59, 999);

    if (period === "day") {
      const dayStart = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 0, 0, 0, 0);
      return inMonth.filter((r) => new Date(r.data_hora) >= dayStart);
    }
    // semana: últimos 7 dias a partir da referência, dentro do mês.
    const weekStart = new Date(ref);
    weekStart.setDate(ref.getDate() - 7);
    return inMonth.filter((r) => new Date(r.data_hora) >= weekStart);
  }, [readings, period, selectedMonth]);

  const chartData = useMemo(() => {
    const buckets: Record<string, Record<Bloco, number> & { label: string; sortKey: number }> = {} as any;
    for (const r of filtered) {
      const k = groupKey(new Date(r.data_hora), period);
      if (!buckets[k]) {
        buckets[k] = { label: k, A: 0, B: 0, C: 0, D: 0, sortKey: new Date(r.data_hora).getTime() } as any;
      }
      buckets[k][r.bloco] += Number(r.consumo_m3);
    }
    return Object.values(buckets).sort((a, b) => a.sortKey - b.sortKey);
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

  const blocoColors: Record<Bloco, string> = { A: "#0EA5E9", B: "#10B981", C: "#F59E0B", D: "#EF4444" };

  // Consumo diário por bloco (leitura do dia - leitura do dia anterior) convertido em m³ pela regra do bloco
  const dailyByBloco = useMemo(() => {
    const out: Record<Bloco, { label: string; consumo: number }[]> = { A: [], B: [], C: [], D: [] };
    for (const b of BLOCOS) {
      const div = divisorBloco(b);
      const byDay = new Map<string, number>();
      const sorted = [...byBlocoSorted[b]].sort(
        (a, c) => new Date(a.data_hora).getTime() - new Date(c.data_hora).getTime(),
      );
      for (const r of sorted) {
        const d = new Date(r.data_hora);
        const key = d.toISOString().slice(0, 10);
        // usa a maior leitura do dia, para o caso de múltiplas leituras
        byDay.set(key, Math.max(byDay.get(key) ?? 0, Number(r.leitura_atual)));
      }
      const days = [...byDay.entries()].sort(([a], [c]) => a.localeCompare(c));

      // Semeia `prev` com a última leitura do bloco anterior ao início do período,
      // para que o primeiro dia (ex.: 01/07) tenha uma base de cálculo.
      let prev: number | null = null;
      if (days.length > 0) {
        const firstDayStart = new Date(`${days[0][0]}T00:00:00`).getTime();
        const priorReadings = readings
          .filter((r) => r.bloco === b && new Date(r.data_hora).getTime() < firstDayStart)
          .sort((a, c) => new Date(c.data_hora).getTime() - new Date(a.data_hora).getTime());
        if (priorReadings.length > 0) prev = Number(priorReadings[0].leitura_atual);
      }

      for (const [day, leitura] of days) {
        const consumo = prev === null ? 0 : Math.max(0, (leitura - prev) / div);
        prev = leitura;
        const [, m, dd] = day.split("-");
        out[b].push({ label: `${dd}/${m}`, consumo: Number(consumo.toFixed(3)) });
      }
    }
    return out;
  }, [byBlocoSorted, readings]);

  // Média de consumo diário por bloco — alterna entre ignorar a primeira leitura (consumo inicial zero) ou incluir todos os dias.
  const mediaByBloco = useMemo(() => {
    const out: Record<Bloco, number> = { A: 0, B: 0, C: 0, D: 0 };
    const fn = incluirZeros ? mediaIncluindoZeros : mediaIgnorandoZeroInicial;
    for (const b of BLOCOS) out[b] = fn(dailyByBloco[b]);
    return out;
  }, [dailyByBloco, incluirZeros]);

  // Consumo diário total — respeita o período selecionado (ano = histórico completo).
  const dailyTotalData = useMemo(() => {
    const source = period === "year" ? readings : filtered;
    const byDay = new Map<string, number>();
    for (const r of source) {
      const key = new Date(r.data_hora).toISOString().slice(0, 10);
      byDay.set(key, (byDay.get(key) ?? 0) + Number(r.consumo_m3));
    }
    const sorted = [...byDay.entries()].sort(([a], [c]) => a.localeCompare(c));
    return sorted.map(([day, consumo]) => {
      const [y, m, dd] = day.split("-");
      return {
        label: period === "year" ? `${dd}/${m}/${y.slice(2)}` : `${dd}/${m}`,
        consumo: Number(consumo.toFixed(3)),
      };
    });
  }, [readings, filtered, period]);


  const exportCSV = () => {
    const lines: string[][] = [];
    for (const b of BLOCOS) {
      lines.push([`Bloco ${b}`]);
      lines.push(["Data/Hora", "Leitura Atual", "Leitura Anterior", "Consumo"]);
      for (const r of byBlocoSorted[b]) {
        lines.push([
          new Date(r.data_hora).toLocaleString("pt-BR"),
          fmtLeitura(r.leitura_atual, b),
          fmtLeitura(r.leitura_anterior, b),
          fmtConsumo(r.consumo_m3, b),
        ]);
      }
      lines.push([`Total Bloco ${b}`, "", "", fmtConsumo(totals.byBloco[b], b)]);
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

  const captureChartSvg = (id: string): string => {
    const el = document.querySelector(`[data-chart="${id}"] svg`);
    if (!el) return "";
    const clone = el.cloneNode(true) as SVGElement;
    if (!clone.getAttribute("xmlns")) clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const w = (el as SVGElement).clientWidth || 600;
    const h = (el as SVGElement).clientHeight || 280;
    if (!clone.getAttribute("viewBox")) clone.setAttribute("viewBox", `0 0 ${w} ${h}`);
    clone.setAttribute("width", "100%");
    clone.setAttribute("height", "auto");
    return clone.outerHTML;
  };

  const exportPDF = () => {
    const chartGeral = captureChartSvg("geral-daily");
    const chartEvol = captureChartSvg("geral-line");
    const chartsBloco = BLOCOS.map((b) => ({ b, svg: captureChartSvg(`bloco-${b}`) }));

    const overviewCharts = [
      { title: "Consumo diário total", svg: chartGeral },
      { title: "Evolução do consumo", svg: chartEvol },
      ...chartsBloco.map((c) => ({ title: `Bloco ${c.b} — consumo diário`, svg: c.svg })),
    ].filter((c) => c.svg);

    const chartsGridHtml = `<div class="charts-grid">${overviewCharts
      .map(
        (c) => `<div class="chart-cell"><h3>${c.title}</h3><div class="chart">${c.svg}</div></div>`,
      )
      .join("")}</div>`;

    const blocosHtml = BLOCOS.map((b) => {
      return `
<section class="bloco">
  <h2>Bloco ${b}</h2>
  <p class="meta">Total: <strong>${fmtConsumo(totals.byBloco[b], b)}</strong> · ${byBlocoSorted[b].length} leitura(s)</p>
  ${byBlocoSorted[b].length === 0
    ? `<p class="empty">Sem leituras no período.</p>`
    : `<table><thead><tr><th>Data</th><th>Atual</th><th>Anterior</th><th>Consumo</th></tr></thead><tbody>
${byBlocoSorted[b].map((r) => `<tr><td>${new Date(r.data_hora).toLocaleString("pt-BR")}</td><td>${fmtLeitura(r.leitura_atual, b)}</td><td>${fmtLeitura(r.leitura_anterior, b)}</td><td>${fmtConsumo(r.consumo_m3, b)}</td></tr>`).join("")}
</tbody></table>`}
</section>`;
    }).join("");

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Relatório Terra do Sol</title>
<style>
body{font-family:system-ui,sans-serif;padding:32px;color:#1e293b}
h1{color:#0369a1;margin:0 0 4px}
h2{color:#0369a1;margin:0 0 8px;font-size:18px}
h3{color:#0369a1;margin:0 0 6px;font-size:13px;text-align:center}
.meta{color:#64748b;font-size:13px;margin:0 0 12px}
.empty{color:#94a3b8;font-style:italic}
table{width:100%;border-collapse:collapse;margin-top:8px}
th,td{border:1px solid #e2e8f0;padding:8px;text-align:left;font-size:13px}
th{background:#f1f5f9}
.bloco{margin-top:24px;page-break-inside:avoid}
.bloco + .bloco{page-break-before:always}
.summary{margin-top:16px}
.charts-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px;page-break-after:always}
.chart-cell{border:1px solid #e2e8f0;border-radius:8px;padding:8px;page-break-inside:avoid}
.chart{width:100%}
.chart svg{max-width:100%;height:auto;max-height:180px}
</style></head><body>
<h1>Condomínio Terra do Sol — Relatório de Consumo</h1>
<p class="meta">Período: ${period} · Gerado em ${new Date().toLocaleString("pt-BR")}</p>
<div class="summary">
  <table><thead><tr>${BLOCOS.map((b) => `<th>Bloco ${b}</th>`).join("")}<th>Total Geral</th></tr></thead>
  <tbody><tr>${BLOCOS.map((b) => `<td>${fmtConsumo(totals.byBloco[b], b)}</td>`).join("")}<td><strong>${fmtM3Total(totals.total)}</strong></td></tr></tbody></table>
</div>
${chartsGridHtml}
${blocosHtml}
</body></html>`;

    const w = window.open("", "_blank");
    if (!w) return toast.error("Permita pop-ups");
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 500);
  };

  const handleAnalyze = async () => {
    if (filtered.length === 0) {
      toast.error("Sem dados no período para analisar");
      return;
    }
    setAnalyzing(true);
    setAnalysis("");
    try {
      const payload = filtered.map((r) => ({
        bloco: r.bloco,
        data_hora: r.data_hora,
        consumo_m3: Number(r.consumo_m3),
        leitura_atual: Number(r.leitura_atual),
      }));
      const res = await runAnalysis({ data: { readings: payload, period } });
      setAnalysis(res.analysis);
      toast.success("Análise concluída");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha na análise");
    } finally {
      setAnalyzing(false);
    }
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

      <div className="flex items-center gap-3 flex-wrap">
        <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <TabsList>
            <TabsTrigger value="day">Hoje</TabsTrigger>
            <TabsTrigger value="week">Semana</TabsTrigger>
            <TabsTrigger value="month">Mês</TabsTrigger>
            <TabsTrigger value="year">Ano</TabsTrigger>
          </TabsList>
        </Tabs>
        <Select
          value={selectedMonth}
          onValueChange={setSelectedMonth}
          disabled={period === "year"}
        >
          <SelectTrigger className="w-[200px]" data-testid="select-mes">
            <SelectValue placeholder="Selecione o mês" />
          </SelectTrigger>
          <SelectContent>
            {availableMonths.map((m) => (
              <SelectItem key={m} value={m} className="capitalize">
                {monthLabel(m)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {period === "year" && (
          <span className="text-xs text-muted-foreground">
            Exibindo todos os meses
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Switch
          id="incluir-zeros"
          checked={incluirZeros}
          onCheckedChange={setIncluirZeros}
          data-testid="toggle-incluir-zeros"
        />
        <Label htmlFor="incluir-zeros" className="cursor-pointer">
          {incluirZeros ? "Incluindo zeros na média" : "Ignorando zero inicial da média"}
        </Label>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {BLOCOS.map((b) => {
          const grad = { A: "bg-gradient-bloco-a border-bloco-a", B: "bg-gradient-bloco-b border-bloco-b", C: "bg-gradient-bloco-c border-bloco-c", D: "bg-gradient-bloco-d border-bloco-d" }[b];
          const dot = { A: "bg-bloco-a", B: "bg-bloco-b", C: "bg-bloco-c", D: "bg-bloco-d" }[b];
          return (
            <Card key={b} className={`p-4 shadow-soft ${grad}`}>
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${dot}`} aria-hidden />
                <p className="text-xs text-muted-foreground">Bloco {b}</p>
              </div>
              <p className="text-xl font-semibold tabular-nums mt-1">{fmtConsumo(totals.byBloco[b], b)}</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                Média/dia:{" "}
                <span
                  className="tabular-nums font-medium text-foreground/80"
                  data-testid={`media-bloco-${b}`}
                >
                  {fmtConsumo(mediaByBloco[b], b)}
                </span>
              </p>
            </Card>
          );
        })}
      </div>


      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4 shadow-soft">
          <p className="text-xs text-muted-foreground">Total acumulado</p>
          <p className="text-xl font-semibold tabular-nums mt-1">{fmtM3Total(totals.total)}</p>
        </Card>
        <Card className="p-4 shadow-soft">
          <p className="text-xs text-muted-foreground">Média diária</p>
          <p className="text-xl font-semibold tabular-nums mt-1">{fmtM3Total(totals.media)}</p>
        </Card>
      </div>

      <Card className="p-4 shadow-soft border-sky-200/60 bg-gradient-to-br from-sky-50/60 to-transparent dark:from-sky-950/20">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-sky-600" />
            <h2 className="text-sm font-medium">Análise de IA — anomalias de consumo</h2>
          </div>
          <Button size="sm" onClick={handleAnalyze} disabled={analyzing}>
            {analyzing ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Analisando...</>
            ) : (
              <><Sparkles className="mr-2 h-4 w-4" />Analisar período</>
            )}
          </Button>
        </div>
        {!analysis && !analyzing && (
          <p className="text-xs text-muted-foreground mt-3">
            Detecta picos, quedas anormais e padrões fora da média por bloco usando IA.
          </p>
        )}
        {analysis && (
          <div className="mt-4">
            <AnalysisReport markdown={analysis} />
          </div>
        )}
      </Card>


      <Card className="p-4 shadow-soft">
        <h2 className="text-sm font-medium mb-3">Consumo diário total {period === "year" ? "— histórico completo" : `— ${monthLabel(selectedMonth)}`}</h2>
        <div className="h-72 w-full" data-chart="geral-daily">
          <ResponsiveContainer>
            <BarChart data={dailyTotalData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="label" stroke="var(--color-muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
              <Tooltip
                cursor={{ fill: 'transparent' }}
                formatter={(v: number) => [fmtM3Total(Number(v)), "Consumo total"]}
                contentStyle={{
                  backgroundColor: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  color: "var(--popover-foreground)",
                }}
              />
              <Bar dataKey="consumo" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-4 shadow-soft">
        <h2 className="text-sm font-medium mb-3">Evolução do consumo</h2>
        <div className="h-72 w-full" data-chart="geral-line">
          <ResponsiveContainer>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="label" stroke="var(--color-muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
              <Tooltip
                cursor={{ fill: 'transparent' }}
                contentStyle={{
                  backgroundColor: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  color: "var(--popover-foreground)",
                }}
              />
              <Legend />
              <Line type="monotone" dataKey="A" stroke="#0EA5E9" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="B" stroke="#10B981" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="C" stroke="#F59E0B" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="D" stroke="#EF4444" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {BLOCOS.map((b) => (
          <Card key={b} className="p-4 shadow-soft">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-medium">Bloco {b} — consumo diário</h2>
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: blocoColors[b] }} />
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Média diária: <span className="tabular-nums font-medium text-foreground/80">{fmtConsumo(mediaByBloco[b], b)}</span>
            </p>
            <div className="h-56 w-full" data-chart={`bloco-${b}`}>
              <ResponsiveContainer>
                <BarChart data={dailyByBloco[b]}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="label" stroke="var(--color-muted-foreground)" fontSize={11} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={11} />
                  <Tooltip
                    cursor={{ fill: 'transparent' }}
                    formatter={(v: number) => [fmtConsumo(Number(v), b), "Consumo"]}
                    contentStyle={{
                      backgroundColor: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      color: "var(--popover-foreground)",
                    }}
                  />
                  <Bar dataKey="consumo" fill={blocoColors[b]} radius={[4, 4, 0, 0]} />
                  {mediaByBloco[b] > 0 && (
                    <ReferenceLine
                      y={mediaByBloco[b]}
                      stroke={blocoColors[b]}
                      strokeDasharray="4 4"
                      strokeOpacity={0.7}
                      label={{ value: `Média ${fmtConsumo(mediaByBloco[b], b)}`, position: "insideTopRight", fill: "var(--color-muted-foreground)", fontSize: 10 }}
                    />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
            {dailyByBloco[b].length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">Sem leituras no período.</p>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

function daysInPeriod(p: Period) {
  return p === "day" ? 1 : p === "week" ? 7 : p === "month" ? 30 : 365;
}
