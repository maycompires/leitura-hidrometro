## Objetivo
Ajustar o cálculo de **consumo médio por bloco** na página de Relatórios para ignorar o consumo zero inicial (primeira leitura de cada bloco, que não tem leitura anterior).

## Mudança
Arquivo: `src/routes/_authenticated/relatorios.tsx`

No `useMemo` do `mediaByBloco`, filtrar os valores antes de calcular a média, descartando o primeiro registro de cada bloco (que sempre tem consumo = 0 por ser a leitura inicial).

```ts
const mediaByBloco = useMemo(() => {
  const out: Record<Bloco, number> = { A: 0, B: 0, C: 0, D: 0 };
  for (const b of BLOCOS) {
    // ignora a primeira leitura (consumo inicial = 0)
    const vals = dailyByBloco[b].slice(1).map((d) => d.consumo);
    out[b] = vals.length ? vals.reduce((a, c) => a + c, 0) / vals.length : 0;
  }
  return out;
}, [dailyByBloco]);
```

Isso mantém os zeros legítimos (dias sem consumo após início) no cálculo, removendo apenas o zero estrutural da primeira leitura — coerente com a regra já aplicada à análise de IA.

Nenhuma outra parte da UI muda (cards de média e `ReferenceLine` nos gráficos diários consomem `mediaByBloco` automaticamente).
