import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AlertTriangle, CheckCircle2, Lightbulb, Droplets, FileText, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtM3Total } from "@/lib/utils";
import type { BlockConsumptionSummary, ConsumptionAnomaly } from "@/lib/anomaly-analysis";

type Severity = "alta" | "media" | "baixa" | "ok";

const blocoAccent: Record<string, string> = {
  A: "border-l-sky-500 bg-sky-50/60 dark:bg-sky-950/20",
  B: "border-l-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/20",
  C: "border-l-amber-500 bg-amber-50/60 dark:bg-amber-950/20",
  D: "border-l-rose-500 bg-rose-50/60 dark:bg-rose-950/20",
};

const sevStyle: Record<Severity, { badge: string; label: string; Icon: typeof AlertTriangle }> = {
  alta: {
    badge: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200",
    label: "Alta",
    Icon: AlertTriangle,
  },
  media: {
    badge: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200",
    label: "Média",
    Icon: AlertCircle,
  },
  baixa: {
    badge: "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 border-sky-200",
    label: "Baixa",
    Icon: AlertCircle,
  },
  ok: {
    badge:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200",
    label: "Normal",
    Icon: CheckCircle2,
  },
};

type ParsedItem = { bloco: string; severity: Severity; text: string };

function parseBlocos(md: string): { items: ParsedItem[]; recomendacoes: string } {
  const [beforeRec, ...restRec] = md.split(/^#{1,6}\s*Recomenda[cç][oõ]es\s*$/im);
  const recomendacoes = restRec.join("\n").trim();

  const items: ParsedItem[] = [];
  const lineRe = /(?:^|\n)\s*[-*]\s+\*\*Bloco\s+([A-D])\*\*\s*:?\s*([\s\S]*?)(?=(?:\n\s*[-*]\s+\*\*Bloco)|\n\s*#{1,6}\s|$)/gi;
  const plainRe = /(?:^|\n)\s*Bloco\s+([A-D])\s*:\s*([^\n]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(beforeRec)) !== null) {
    const text = m[2].trim();
    items.push({ bloco: m[1].toUpperCase(), severity: detectSeverity(text), text });
  }
  if (items.length === 0) {
    while ((m = plainRe.exec(beforeRec)) !== null) {
      const text = m[2].trim();
      items.push({ bloco: m[1].toUpperCase(), severity: detectSeverity(text), text });
    }
  }
  return { items, recomendacoes };
}

function detectSeverity(text: string): Severity {
  const t = text.toLowerCase();
  if (/(dentro do esperado|normal|sem anomalia)/.test(t)) return "ok";
  if (/(severidade\s*:?\s*alta|alta severidade|cr[ií]tic)/.test(t)) return "alta";
  if (/(severidade\s*:?\s*m[eé]dia|m[eé]dia severidade)/.test(t)) return "media";
  if (/(severidade\s*:?\s*baixa|baixa severidade)/.test(t)) return "baixa";
  return "media";
}

const mdComponents = {
  p: (props: any) => <p className="text-sm leading-relaxed text-foreground/90" {...props} />,
  strong: (props: any) => <strong className="font-semibold text-foreground" {...props} />,
  ul: (props: any) => <ul className="list-disc pl-5 space-y-1 text-sm" {...props} />,
  ol: (props: any) => <ol className="list-decimal pl-5 space-y-1 text-sm" {...props} />,
  li: (props: any) => <li className="text-foreground/90" {...props} />,
  h1: (props: any) => <h3 className="text-base font-semibold text-foreground mt-2" {...props} />,
  h2: (props: any) => <h3 className="text-base font-semibold text-foreground mt-2" {...props} />,
  h3: (props: any) => <h3 className="text-sm font-semibold text-foreground mt-2" {...props} />,
  code: (props: any) => (
    <code className="px-1 py-0.5 rounded bg-muted text-xs font-mono" {...props} />
  ),
};

export function AnalysisReport({
  markdown,
  anomalies = [],
  summaries = [],
  period,
  generatedAt,
}: {
  markdown: string;
  anomalies?: ConsumptionAnomaly[];
  summaries?: BlockConsumptionSummary[];
  period?: string;
  generatedAt?: string;
}) {
  const { items, recomendacoes } = parseBlocos(markdown);

  if (/^#\s+RELATÓRIO TÉCNICO/im.test(markdown)) {
    return (
      <article className="overflow-hidden rounded-lg border bg-card shadow-soft" data-ai-report>
        <header className="border-b bg-muted/35 px-5 py-6 text-center sm:px-8 sm:py-8">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <FileText className="h-5 w-5" />
          </div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">Condomínio Residencial Terra do Sol</p>
          <h2 className="mt-2 text-lg font-semibold uppercase sm:text-xl">Relatório técnico de análise do consumo de água</h2>
          <p className="mt-2 text-xs text-muted-foreground">
            Período: {period ?? "selecionado"}
            {generatedAt ? ` · Emitido em ${new Date(generatedAt).toLocaleString("pt-BR")}` : ""}
          </p>
        </header>

        <div className="space-y-6 px-5 py-6 sm:px-8">
          <section>
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <h3 className="text-sm font-semibold uppercase">Anomalias confirmadas acima de 30%</h3>
            </div>
            {anomalies.length ? (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full min-w-[620px] text-left text-xs">
                  <thead className="bg-muted/60 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2.5 font-semibold">Bloco</th>
                      <th className="px-3 py-2.5 font-semibold">Data</th>
                      <th className="px-3 py-2.5 font-semibold">Consumo</th>
                      <th className="px-3 py-2.5 font-semibold">Média</th>
                      <th className="px-3 py-2.5 font-semibold">Excedente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {anomalies.map((item) => (
                      <tr key={`${item.bloco}-${item.data_hora}`} className="border-t">
                        <td className="px-3 py-2.5 font-semibold">{item.bloco}</td>
                        <td className="px-3 py-2.5">{new Date(item.data_hora).toLocaleDateString("pt-BR")}</td>
                        <td className="px-3 py-2.5 tabular-nums">{fmtM3Total(item.consumo_m3)}</td>
                        <td className="px-3 py-2.5 tabular-nums">{fmtM3Total(item.media_m3)}</td>
                        <td className="px-3 py-2.5 font-semibold text-destructive">+{item.percentual_acima.toFixed(1).replace(".", ",")}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-md border border-success/30 bg-success/10 p-3 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                Nenhuma leitura excedeu 30% acima da média do respectivo bloco.
              </div>
            )}
          </section>

          {summaries.length > 0 && (
            <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {summaries.map((summary) => (
                <div key={summary.bloco} className="rounded-md border bg-muted/20 p-3">
                  <p className="text-[11px] font-semibold uppercase text-muted-foreground">Bloco {summary.bloco}</p>
                  <p className="mt-1 text-sm font-semibold tabular-nums">{fmtM3Total(summary.media)}/dia</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{summary.leituras} leitura(s) válidas</p>
                </div>
              ))}
            </section>
          )}

          <div className="abnt-report prose-none text-sm leading-7 text-foreground/90">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
              {markdown.replace(/^#\s+RELATÓRIO TÉCNICO DE ANÁLISE DO CONSUMO DE ÁGUA\s*/im, "")}
            </ReactMarkdown>
          </div>

          <footer className="flex items-start gap-2 border-t pt-4 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Documento de apoio à gestão. As indicações devem ser confirmadas por inspeção técnica antes de intervenções.
          </footer>
        </div>
      </article>
    );
  }

  if (items.length === 0) {
    return (
      <div className="prose-none text-sm leading-relaxed text-foreground/90">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
          {markdown}
        </ReactMarkdown>
      </div>
    );
  }

  const critCount = items.filter((i) => i.severity === "alta").length;
  const warnCount = items.filter((i) => i.severity === "media" || i.severity === "baixa").length;
  const okCount = items.filter((i) => i.severity === "ok").length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <StatChip label="Críticas" value={critCount} tone="rose" Icon={AlertTriangle} />
         <StatChip label="Atenção" value={warnCount} tone="amber" Icon={AlertTriangle} />
        <StatChip label="Normais" value={okCount} tone="emerald" Icon={CheckCircle2} />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((it, idx) => {
          const s = sevStyle[it.severity];
          return (
            <div
              key={idx}
              className={cn(
                "rounded-lg border border-l-4 p-3 shadow-sm bg-card",
                blocoAccent[it.bloco],
              )}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                  <Droplets className="h-4 w-4 text-foreground/70" />
                  <span className="text-sm font-semibold">Bloco {it.bloco}</span>
                </div>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                    s.badge,
                  )}
                >
                  <s.Icon className="h-3 w-3" />
                  {s.label}
                </span>
              </div>
              <div className="text-sm leading-relaxed text-foreground/90">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                  {it.text}
                </ReactMarkdown>
              </div>
            </div>
          );
        })}
      </div>

      {recomendacoes && (
        <div className="rounded-lg border border-sky-200/70 dark:border-sky-900/50 bg-gradient-to-br from-sky-50 to-transparent dark:from-sky-950/30 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb className="h-4 w-4 text-sky-600" />
            <h3 className="text-sm font-semibold">Recomendações</h3>
          </div>
          <div className="text-sm leading-relaxed text-foreground/90">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
              {recomendacoes}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}

function StatChip({
  label,
  value,
  tone,
  Icon,
}: {
  label: string;
  value: number;
  tone: "rose" | "amber" | "emerald";
  Icon: typeof AlertTriangle;
}) {
  const toneCls =
    tone === "rose"
      ? "text-rose-600 bg-rose-50 dark:bg-rose-950/30 border-rose-200/60"
      : tone === "amber"
        ? "text-amber-600 bg-amber-50 dark:bg-amber-950/30 border-amber-200/60"
        : "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200/60";
  return (
    <div className={cn("rounded-lg border px-3 py-2 flex items-center gap-2", toneCls)}>
      <Icon className="h-4 w-4" />
      <div className="leading-tight">
        <div className="text-lg font-semibold tabular-nums">{value}</div>
        <div className="text-[11px] opacity-80">{label}</div>
      </div>
    </div>
  );
}
