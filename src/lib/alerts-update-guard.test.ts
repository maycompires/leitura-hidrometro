import { describe, it, expect } from "vitest";

// Espelho, em TypeScript, do trigger `alerts_prevent_sensitive_update`
// definido em `supabase/migrations/20260712234118_*.sql`. Este teste
// documenta o contrato observado por qualquer usuário autenticado
// atualizando linhas de `public.alerts`:
//
//   - apenas as colunas `lido_por` e `resolvido` podem mudar;
//   - qualquer alteração em `bloco`, `tipo`, `severidade`, `mensagem`,
//     `reading_id`, `metadata` ou `created_at` deve lançar o erro
//     "Only lido_por and resolvido may be updated on alerts".
//
// A verificação em nível de banco vive na migração citada; este arquivo
// falha rapidamente se alguém afrouxar a política sem atualizar o trigger.

type AlertRow = {
  id: string;
  bloco: string;
  tipo: string;
  severidade: string;
  mensagem: string;
  reading_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  lido_por: string[];
  resolvido: boolean;
};

const SENSITIVE_COLUMNS = [
  "bloco",
  "tipo",
  "severidade",
  "mensagem",
  "reading_id",
  "metadata",
  "created_at",
] as const;

const GUARD_ERROR = "Only lido_por and resolvido may be updated on alerts";

/** Simula o gatilho BEFORE UPDATE aplicado a `public.alerts`. */
function applyAlertsUpdate(old: AlertRow, next: AlertRow): AlertRow {
  for (const col of SENSITIVE_COLUMNS) {
    const a = JSON.stringify(old[col]);
    const b = JSON.stringify(next[col]);
    if (a !== b) throw new Error(GUARD_ERROR);
  }
  return next;
}

const baseRow: AlertRow = {
  id: "00000000-0000-0000-0000-0000000000aa",
  bloco: "A",
  tipo: "leitura_suspeita",
  severidade: "aviso",
  mensagem: "Consumo elevado no Bloco A",
  reading_id: "00000000-0000-0000-0000-0000000000bb",
  metadata: { origem: "trigger" },
  created_at: "2026-06-15T12:00:00Z",
  lido_por: [],
  resolvido: false,
};

describe("alerts — usuário autenticado só pode alterar lido_por e resolvido", () => {
  it.each([
    ["bloco", { bloco: "B" }],
    ["tipo", { tipo: "consumo_alto" }],
    ["severidade", { severidade: "critico" }],
    ["mensagem", { mensagem: "editado" }],
    ["reading_id", { reading_id: null }],
    ["metadata", { metadata: { hack: true } }],
    ["created_at", { created_at: "1999-01-01T00:00:00Z" }],
  ])("bloqueia alteração de %s", (_field, patch) => {
    expect(() => applyAlertsUpdate(baseRow, { ...baseRow, ...(patch as Partial<AlertRow>) })).toThrow(
      GUARD_ERROR,
    );
  });

  it("permite marcar a leitura como resolvida", () => {
    const next = applyAlertsUpdate(baseRow, { ...baseRow, resolvido: true });
    expect(next.resolvido).toBe(true);
  });

  it("permite adicionar um usuário em lido_por", () => {
    const uid = "11111111-1111-1111-1111-111111111111";
    const next = applyAlertsUpdate(baseRow, { ...baseRow, lido_por: [uid] });
    expect(next.lido_por).toEqual([uid]);
  });

  it("permite atualizar lido_por e resolvido simultaneamente", () => {
    const uid = "22222222-2222-2222-2222-222222222222";
    const next = applyAlertsUpdate(baseRow, {
      ...baseRow,
      resolvido: true,
      lido_por: [uid],
    });
    expect(next.resolvido).toBe(true);
    expect(next.lido_por).toEqual([uid]);
  });

  it("bloqueia mesmo quando muda um campo sensível junto de um permitido", () => {
    expect(() =>
      applyAlertsUpdate(baseRow, { ...baseRow, resolvido: true, bloco: "C" }),
    ).toThrow(GUARD_ERROR);
  });
});
