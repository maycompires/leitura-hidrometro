import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ───────────────────────── Mocks ─────────────────────────
// Evita pulling do client real (e Supabase) — somente os tipos/constantes que o componente usa.
vi.mock("@/lib/api", async () => {
  return {
    BLOCOS: ["A", "B", "C", "D"] as const,
    fetchReadings: vi.fn(async () => []),
  };
});

// useServerFn devolve a função passada — não precisamos disparar IA no teste.
vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => fn,
}));

// O server fn em si não importa pro teste — basta existir.
vi.mock("@/lib/anomalies.functions", () => ({
  analyzeConsumption: vi.fn(),
}));

// Recharts requer layout real; substituímos por stubs renderizáveis em jsdom.
vi.mock("recharts", () => {
  const Stub = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Stub,
    BarChart: Stub,
    Bar: Stub,
    LineChart: Stub,
    Line: Stub,
    XAxis: Stub,
    YAxis: Stub,
    Tooltip: Stub,
    CartesianGrid: Stub,
    Legend: Stub,
    ReferenceLine: Stub,
  };
});

// Evita ruído de toasts no jsdom.
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Import APÓS os mocks.
import { ReportsPage } from "./relatorios";
import type { Reading } from "@/lib/api";

// ───────────────────────── Fixture ─────────────────────────
// Bloco A usa divisor 1000. Sequência escolhida para gerar números limpos:
//   15/06: leitura 1000 → consumo inicial = 0
//   16/06: leitura 3000 → consumo = 2 m³
//   17/06: leitura 5000 → consumo = 2 m³
// Média ignorando zero inicial:  (2 + 2) / 2 = 2.000 m³ → "2 m³ 000 L"
// Média incluindo todos os dias: (0 + 2 + 2) / 3 ≈ 1.333 m³ → "1 m³ 333 L"
function makeReading(partial: Partial<Reading> & Pick<Reading, "id" | "data_hora" | "leitura_atual">): Reading {
  return {
    bloco: "A",
    leitura_anterior: 0,
    consumo_m3: 0,
    foto_url: null,
    observacoes: null,
    usuario_id: "u1",
    created_at: partial.data_hora,
    ...partial,
  } as Reading;
}

const FIXED_NOW = new Date("2026-06-20T12:00:00Z");

function buildReadings(): Reading[] {
  return [
    makeReading({ id: "1", data_hora: "2026-06-15T12:00:00Z", leitura_atual: 1000 }),
    makeReading({ id: "2", data_hora: "2026-06-16T12:00:00Z", leitura_atual: 3000 }),
    makeReading({ id: "3", data_hora: "2026-06-17T12:00:00Z", leitura_atual: 5000 }),
  ];
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // Pré-popula a query para o componente não disparar fetchReadings real.
  qc.setQueryData(["readings"], buildReadings());
  return render(
    <QueryClientProvider client={qc}>
      <ReportsPage />
    </QueryClientProvider>,
  );
}

describe("ReportsPage — média por bloco (zero inicial vs incluir zeros)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEachCleanup();

  it("por padrão ignora a primeira leitura zerada no cálculo da média", () => {
    renderPage();
    const media = screen.getByTestId("media-bloco-A");
    expect(media.textContent).toBe("2 m³ 000 L");
  });

  it("ao ativar o toggle, passa a incluir o zero inicial e a média muda", async () => {
    vi.useRealTimers(); // user-event precisa de timers reais para advance interno
    vi.setSystemTime(FIXED_NOW);
    const user = userEvent.setup();
    renderPage();

    // Estado inicial: ignorando zero
    expect(screen.getByTestId("media-bloco-A").textContent).toBe("2 m³ 000 L");
    expect(
      screen.getByText(/Ignorando zero inicial da média/i),
    ).toBeInTheDocument();

    // Toggle
    await user.click(screen.getByTestId("toggle-incluir-zeros"));

    // Agora a média deve refletir a inclusão do zero inicial
    expect(screen.getByTestId("media-bloco-A").textContent).toBe("1 m³ 333 L");
    expect(
      screen.getByText(/Incluindo zeros na média/i),
    ).toBeInTheDocument();
  });

  it("blocos sem dados continuam com média zerada nos dois modos", async () => {
    vi.useRealTimers();
    vi.setSystemTime(FIXED_NOW);
    const user = userEvent.setup();
    renderPage();

    // Bloco B não tem leituras na fixture — média = 0 (divisor 100, formato "X m³ YY L").
    expect(screen.getByTestId("media-bloco-B").textContent).toBe("0 m³ 00 L");
    await user.click(screen.getByTestId("toggle-incluir-zeros"));
    expect(screen.getByTestId("media-bloco-B").textContent).toBe("0 m³ 00 L");
  });
});

// helper de cleanup compatível com vitest sem globals
function afterEachCleanup() {
  // @ts-expect-error vitest exposes afterEach when globals=false via import
  import("vitest").then(({ afterEach }) => afterEach(() => cleanup()));
}
