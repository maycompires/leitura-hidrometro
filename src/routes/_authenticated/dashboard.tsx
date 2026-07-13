import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { CSSProperties } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Droplet, TrendingUp, TrendingDown, Minus, ArrowRight, Plus } from "lucide-react";
import { BLOCOS, fetchReadings, type Bloco, type Reading } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn, fmtLeitura, fmtConsumo, fmtM3Total } from "@/lib/utils";


export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function lastTwo(readings: Reading[], bloco: Bloco) {
  return readings.filter((r) => r.bloco === bloco).slice(0, 2);
}

function Dashboard() {
  const { data: readings = [], isLoading } = useQuery({
    queryKey: ["readings"],
    queryFn: () => fetchReadings(),
  });

  const totalHoje = readings
    .filter((r) => new Date(r.data_hora).toDateString() === new Date().toDateString())
    .reduce((sum, r) => sum + Number(r.consumo_m3), 0);

  return (
    <div className="space-y-8">
      <section className="rounded-2xl bg-gradient-hero p-6 text-primary-foreground shadow-elevated relative overflow-hidden">
        <div className="absolute -right-8 -bottom-8 opacity-20">
          <Droplet className="h-40 w-40" />
        </div>
        <div className="relative">
          <p className="text-sm opacity-90">Consumo registrado hoje</p>
          <p className="mt-1 text-4xl font-semibold tracking-tight">{fmtM3Total(totalHoje)}</p>
          <p className="mt-2 text-sm opacity-80">Soma das leituras de hoje em todos os blocos</p>
        </div>
      </section>

      <section>
        <div className="flex items-end justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Blocos</h2>
            <p className="text-sm text-muted-foreground">Toque em um bloco para registrar uma nova leitura</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {BLOCOS.map((b) => {
            const lt = lastTwo(readings, b);
            const last = lt[0];
            const prev = lt[1];
            const diff = last && prev ? Number(last.consumo_m3) - Number(prev.consumo_m3) : 0;
            const trend = !last || !prev ? "flat" : diff > 0.1 ? "up" : diff < -0.1 ? "down" : "flat";
            return <BlockCard key={b} bloco={b} last={last} loading={isLoading} trend={trend} />;
          })}
        </div>
      </section>
    </div>
  );
}

function BlockCard({
  bloco,
  last,
  loading,
  trend,
}: {
  bloco: Bloco;
  last?: Reading;
  loading: boolean;
  trend: "up" | "down" | "flat";
}) {
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendColor =
    trend === "up" ? "text-warning" : trend === "down" ? "text-success" : "text-muted-foreground";

  const gradClass = {
    A: "bg-gradient-bloco-a border-bloco-a",
    B: "bg-gradient-bloco-b border-bloco-b",
    C: "bg-gradient-bloco-c border-bloco-c",
    D: "bg-gradient-bloco-d border-bloco-d",
  }[bloco];
  const accentClass = {
    A: "bg-bloco-a",
    B: "bg-bloco-b",
    C: "bg-bloco-c",
    D: "bg-bloco-d",
  }[bloco];
  const waveColor = {
    A: "rgba(14, 165, 233, 0.38)",
    B: "rgba(16, 185, 129, 0.38)",
    C: "rgba(245, 158, 11, 0.4)",
    D: "rgba(239, 68, 68, 0.38)",
  }[bloco];
  const waveColor2 = {
    A: "rgba(14, 165, 233, 0.22)",
    B: "rgba(16, 185, 129, 0.22)",
    C: "rgba(245, 158, 11, 0.24)",
    D: "rgba(239, 68, 68, 0.22)",
  }[bloco];

  return (
    <Card className={cn(gradClass, "relative overflow-hidden shadow-soft p-5 transition-all hover:shadow-elevated hover:-translate-y-0.5")}>
      <div
        className="water-wave"
        style={{ "--water-wave-color": waveColor, "--water-wave-color-2": waveColor2 } as CSSProperties}
        aria-hidden="true"
      />


      <div className="relative z-10 flex items-start justify-between">

        <div>
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl shadow-soft", accentClass)}>
            <Droplet className="h-5 w-5" />
          </div>
          <h3 className="mt-3 text-xl font-semibold">Bloco {bloco}</h3>
        </div>
        <div className={cn("flex items-center gap-1 text-xs font-medium", trendColor)}>
          <TrendIcon className="h-4 w-4" />
          {trend === "up" ? "Subindo" : trend === "down" ? "Caindo" : "Estável"}
        </div>
      </div>


      <div className="relative z-10 mt-4 space-y-1">
        {loading ? (
          <div className="h-10 w-32 animate-pulse rounded bg-muted" />
        ) : last ? (
          <>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-semibold tabular-nums">{fmtLeitura(last.leitura_atual, bloco)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Consumo: <span className="font-medium text-foreground">{fmtConsumo(last.consumo_m3, bloco)}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(last.data_hora), { addSuffix: true, locale: ptBR })}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Sem leituras ainda</p>
        )}
      </div>

      <Button asChild className="relative z-10 w-full mt-5" variant={last ? "secondary" : "default"}>
        <Link to="/leitura/$bloco" params={{ bloco }}>
          <Plus className="mr-1 h-4 w-4" />
          Nova leitura
          <ArrowRight className="ml-auto h-4 w-4" />
        </Link>
      </Button>

    </Card>
  );
}
