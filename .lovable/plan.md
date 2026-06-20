# Plano: Alertas automáticos + Compartilhamento de relatórios

Vou adicionar duas funcionalidades complementares ao app: **alertas inteligentes** (consumo anormal ou leitura atrasada) e **compartilhamento de relatórios** via link público temporário, WhatsApp e email.

## 1. Alertas automáticos

### Central de alertas no app (sino no topo)
- Ícone de sino no `AppShell` com badge de contagem de alertas não lidos.
- Painel (Popover) listando alertas recentes, agrupados por bloco, com data, tipo e ação rápida ("marcar como lido" / "ver no histórico").
- Página dedicada `/alertas` com filtros (bloco, tipo, lidos/não lidos).

### Tipos de alerta gerados
1. **Consumo acima da média** — quando o consumo diário de um bloco supera em mais de X% a média móvel dos últimos 7 dias (X configurável, padrão 50%).
2. **Possível vazamento** — três dias consecutivos com consumo acima da média.
3. **Leitura atrasada** — bloco sem nova leitura há mais de N dias (padrão 7 dias).
4. **Leitura suspeita** — leitura atual menor que a anterior (já avisamos no formulário, mas registra como alerta para auditoria).

### Como os alertas são gerados
- **Em tempo real ao salvar leitura**: ao inserir/atualizar, um trigger Postgres calcula média recente do bloco e insere em `alerts` quando excede o limiar ou quando há leitura suspeita.
- **Diariamente às 09:00 (pg_cron)**: chama um endpoint público `/api/public/hooks/check-stale-readings` que percorre os blocos e gera alertas de "leitura atrasada".

### Notificações
- **In-app**: toast (sonner) quando um novo alerta surge na sessão atual + badge no sino.
- **Email opcional**: usando Lovable Emails — cada usuário pode ativar nas preferências ("Receber email quando houver alerta"). Email enviado pelo mesmo endpoint do cron e pelo trigger via `pg_net`.

## 2. Compartilhamento de relatórios

### Link público temporário
- Botão "Compartilhar" na página de Relatórios, ao lado de Excel/PDF.
- Modal permite escolher: período já selecionado, blocos incluídos, validade do link (24h, 7d, 30d).
- Gera URL `/r/:token` (rota pública, sem autenticação) que renderiza uma versão somente-leitura do relatório (cards de totais, gráficos, tabela por bloco) com aviso de "Relatório compartilhado por Condomínio Terra do Sol".
- Token armazenado em `shared_reports` com `expires_at`; expirados retornam página "link expirado".

### Botões de envio rápido
- No mesmo modal: "Enviar por WhatsApp" (abre `https://wa.me/?text=...` com a URL e resumo) e "Enviar por email" (`mailto:` com assunto e corpo pré-preenchidos).
- Botão "Copiar link" com confirmação.

## Detalhes técnicos

### Migrations Postgres
- Tabela `alerts` (`id`, `bloco`, `tipo`, `severidade`, `mensagem`, `metadata jsonb`, `reading_id`, `lido_por jsonb`, `created_at`) com RLS (todos autenticados leem; service_role escreve) e GRANTs.
- Tabela `user_preferences` (`user_id`, `email_alerts_enabled`, `consumo_threshold_pct`, `dias_sem_leitura`) com RLS por `auth.uid()`.
- Tabela `shared_reports` (`id`, `token`, `criado_por`, `period`, `filtros jsonb`, `expires_at`, `created_at`) — token gerado server-side; leitura pública via server function que valida `expires_at`.
- Função `check_reading_anomaly()` + trigger `AFTER INSERT OR UPDATE` em `readings` que insere em `alerts` quando aplica.
- pg_cron job diário chamando `/api/public/hooks/check-stale-readings` com `apikey` anon.

### Server functions (TanStack)
- `src/lib/alerts.functions.ts`: `fetchAlerts`, `markAlertRead`, `dismissAlert`, `fetchUnreadCount` (autenticadas com `requireSupabaseAuth`).
- `src/lib/sharing.functions.ts`: `createShareLink` (auth), `fetchSharedReport` (pública, valida token+expiração via cliente publishable).
- `src/lib/preferences.functions.ts`: `getMyPreferences`, `updateMyPreferences`.

### Server route público
- `src/routes/api/public/hooks/check-stale-readings.ts`: percorre blocos, insere alertas de leitura atrasada, dispara emails para quem optou.
- `src/routes/r.$token.tsx`: rota pública renderizando o relatório compartilhado (sem `_authenticated`).

### UI
- `src/components/AlertsBell.tsx` adicionado no `AppShell` (lado direito do header).
- `src/routes/_authenticated/alertas.tsx` — lista completa.
- `src/routes/_authenticated/preferencias.tsx` — toggles e thresholds.
- `src/components/ShareReportDialog.tsx` — modal de compartilhamento.
- Item de menu "Alertas" e "Preferências" no `AppShell`.

### Emails (opcional ao usuário)
- Setup do Lovable Emails (`scaffold_transactional_email`) só quando o primeiro usuário ativar `email_alerts_enabled` — explicarei o passo de domínio no momento.
- Sem alertas SMS/push neste momento (manter escopo).

## Itens fora deste plano
- Notificações push web (PWA) — pode ser adicionado depois.
- SMS via GatewayAPI — pode ser adicionado depois se desejar.
- Comparativos entre períodos e metas — descartados conforme suas respostas.
