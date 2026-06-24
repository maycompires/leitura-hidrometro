## Objetivo

Trocar o card "Análise de IA — anomalias de consumo" por um **chat com IA** com várias conversas salvas no backend. A IA conversa sobre os consumos e, quando o usuário pedir, dispara a **mesma exportação em PDF** que já existe no botão "PDF" da página de relatórios (com gráficos e tabelas).

## Experiência

1. Na página **Relatórios**, o card de análise é substituído por um card "Chat com IA" mostrando as últimas conversas e um botão **"Nova conversa"** que leva para a tela do chat.
2. Uma nova tela `/chat/<id-da-conversa>` com:
   - Lista lateral de conversas (criar, selecionar, renomear, excluir).
   - Transcrição da conversa com mensagens streaming (markdown).
   - Composer para digitar.
   - Botão "Voltar para Relatórios".
3. A IA recebe automaticamente um resumo dos dados de consumo do período atual (totais, médias por bloco, leituras recentes) — não é preciso colar nada.
4. Quando o usuário pedir "gera o relatório em PDF" (ou equivalente), a IA chama uma ferramenta interna; o app navega para `/relatorios` e dispara automaticamente a mesma exportação em PDF que já existe hoje (gráficos + tabelas por bloco). Aparece um toast confirmando.

## Banco de dados (Lovable Cloud)

Duas novas tabelas com RLS por usuário:

- `chat_threads`: `id`, `user_id`, `title`, `created_at`, `updated_at`.
- `chat_messages`: `id`, `thread_id`, `role` (`user` | `assistant`), `parts` (jsonb — formato `UIMessage` do AI SDK), `created_at`.

Policies escopadas a `auth.uid()`; cada usuário só vê suas próprias conversas. Grants padrão para `authenticated` e `service_role`.

## Backend

- **Server functions** (`src/lib/chat.functions.ts`, protegidas por `requireSupabaseAuth`):
  - `listThreads`, `createThread`, `renameThread`, `deleteThread`
  - `loadThread(threadId)` → mensagens em formato `UIMessage[]`
- **Rota de streaming** `src/routes/api/chat.ts`:
  - Recebe `{ threadId, messages }`, valida o dono do thread, monta um system prompt em PT-BR com o contexto agregado de consumo (totais por bloco, médias, últimos dias).
  - Modelo padrão Lovable AI: `google/gemini-3-flash-preview`.
  - Expõe uma única ferramenta `exportar_relatorio_pdf({ periodo? })` que apenas retorna `{ action: "export_pdf", periodo }`.
  - Em `onFinish`, persiste a mensagem do assistente no `chat_messages`.

## Frontend

- Rotas TanStack novas em `src/routes/_authenticated/`:
  - `chat.tsx` → cria/seleciona thread e redireciona para `chat.$threadId`.
  - `chat.$threadId.tsx` → tela do chat (AI Elements: `Conversation`, `Message`, `MessageResponse`, `PromptInput`, `Shimmer`, `Tool`).
- Instalar AI Elements necessários (`conversation`, `message`, `prompt-input`, `shimmer`, `tool`) e `@ai-sdk/react`.
- Quando a IA chama a tool, o cliente grava `sessionStorage.autoExportPDF = "1"` e navega para `/relatorios`.
- Em `/relatorios`, no `useEffect` inicial: se a flag estiver presente, dispara `exportPDF()` e limpa a flag.
- Substituir o card "Análise de IA — anomalias de consumo" em `relatorios.tsx` por um card "Chat com IA" com lista das últimas 3 conversas e botão "Nova conversa".

## Detalhes técnicos

- Auth: `requireSupabaseAuth` em todas as server fns; `attachSupabaseAuth` já registrado em `src/start.ts`.
- Persistência: `toUIMessageStreamResponse({ originalMessages, onFinish })` — salva mensagem do usuário antes do stream e a do assistente no `onFinish`.
- Render: `message.parts` (texto + tool calls); markdown via `MessageResponse`.
- Loading: `Shimmer` "Pensando..." enquanto `status === "submitted"`.
- Identidade do agente: avatar com ícone de gota d'água (não `Sparkles`).
- O contexto de consumo enviado ao modelo é calculado por uma server fn `buildConsumoContext()` que lê `readings` do usuário e devolve um objeto compacto (totais, médias, últimos 14 dias por bloco).

## Arquivos a criar/editar

- Nova migration: `chat_threads`, `chat_messages` + RLS + grants.
- `src/lib/chat.functions.ts` — CRUD de threads/mensagens.
- `src/lib/ai-gateway.server.ts` — helper Lovable AI Gateway.
- `src/routes/api/chat.ts` — endpoint de streaming com tool `exportar_relatorio_pdf`.
- `src/routes/_authenticated/chat.tsx` e `chat.$threadId.tsx` — UI do chat.
- `src/components/ai-elements/*` — instalados via `ai-elements@latest add ...`.
- `src/routes/_authenticated/relatorios.tsx` — remover card de análise atual, adicionar card "Chat com IA" + auto-export por flag.
- `package.json`/`bun.lock` — `ai`, `@ai-sdk/react`, `@ai-sdk/openai-compatible`, `react-markdown` (se ainda não houver).

## Fora do escopo

- Anexar imagens/áudio ao chat.
- Compartilhamento de conversa entre usuários.
- Edição/regeneração de mensagens passadas.

Confirma para eu implementar?
