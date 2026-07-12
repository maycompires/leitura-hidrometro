import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";

// Integração real com o Postgres do projeto para validar o trigger
// `alerts_prevent_sensitive_update_trg`: campos sensíveis não podem ser
// alterados após o insert; apenas `lido_por` e `resolvido` podem mudar.
//
// Requer as variáveis PG* configuradas no ambiente (psql). Caso não estejam,
// o teste é ignorado para não quebrar execuções offline.
const hasPg = !!process.env.PGHOST;
const d = hasPg ? describe : describe.skip;

function psql(sql: string): { stdout: string; status: number; stderr: string } {
  try {
    const stdout = execFileSync("psql", ["-v", "ON_ERROR_STOP=1", "-tAX", "-c", sql], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { stdout, status: 0, stderr: "" };
  } catch (err: unknown) {
    const e = err as { status?: number; stderr?: Buffer | string; stdout?: Buffer | string };
    return {
      stdout: String(e.stdout ?? ""),
      status: e.status ?? 1,
      stderr: String(e.stderr ?? ""),
    };
  }
}

d("alerts — trigger de proteção de campos sensíveis", () => {
  let alertId = "";

  beforeAll(() => {
    const r = psql(
      `INSERT INTO public.alerts (bloco, tipo, severidade, mensagem)
       VALUES ('A','leitura_suspeita','aviso','teste guard')
       RETURNING id;`,
    );
    expect(r.status).toBe(0);
    alertId = r.stdout.trim();
    expect(alertId).toMatch(/^[0-9a-f-]{36}$/);
  });

  afterAll(() => {
    if (alertId) psql(`DELETE FROM public.alerts WHERE id = '${alertId}';`);
  });

  const sensitiveUpdates: Array<[string, string]> = [
    ["bloco", "UPDATE public.alerts SET bloco='B' WHERE id='__ID__';"],
    ["tipo", "UPDATE public.alerts SET tipo='consumo_alto' WHERE id='__ID__';"],
    ["severidade", "UPDATE public.alerts SET severidade='critico' WHERE id='__ID__';"],
    ["mensagem", "UPDATE public.alerts SET mensagem='hack' WHERE id='__ID__';"],
    ["reading_id", "UPDATE public.alerts SET reading_id=NULL WHERE id='__ID__';"],
    ["metadata", `UPDATE public.alerts SET metadata='{"x":1}'::jsonb WHERE id='__ID__';`],
    ["created_at", "UPDATE public.alerts SET created_at=now() WHERE id='__ID__';"],
  ];

  it.each(sensitiveUpdates)("bloqueia alteração de %s", (_field, sqlTpl) => {
    const r = psql(sqlTpl.replace("__ID__", alertId));
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/Only lido_por and resolvido may be updated on alerts/);
  });

  it("permite atualizar lido_por", () => {
    const uid = "00000000-0000-0000-0000-000000000001";
    const r = psql(
      `UPDATE public.alerts SET lido_por = ARRAY['${uid}']::uuid[] WHERE id='${alertId}';`,
    );
    expect(r.status).toBe(0);
    const check = psql(`SELECT lido_por[1]::text FROM public.alerts WHERE id='${alertId}';`);
    expect(check.stdout.trim()).toBe(uid);
  });

  it("permite atualizar resolvido", () => {
    const r = psql(`UPDATE public.alerts SET resolvido = true WHERE id='${alertId}';`);
    expect(r.status).toBe(0);
    const check = psql(`SELECT resolvido FROM public.alerts WHERE id='${alertId}';`);
    expect(check.stdout.trim()).toBe("t");
  });
});
