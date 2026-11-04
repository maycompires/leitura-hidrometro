# Terra do Sol - Controle da água

Crie um aplicativo web/mobile moderno, minimalista e intuitivo para o Condomínio Residencial Terra do Sol, destinado ao controle diário de leitura de consumo de água dos quatro hidrômetros do condomínio.

Objetivo

Permitir o registro diário das leituras dos hidrômetros dos seguintes blocos:

Bloco A

Bloco B

Bloco C

Bloco D

O sistema deve ser simples, rápido e agradável de usar, priorizando a experiência do usuário.

Design e Experiência do Usuário

Interface moderna e minimalista.

Cores suaves e elegantes.

Layout responsivo para celular, tablet e desktop.

Cards individuais para cada bloco.

Ícones e gráficos modernos.

Navegação simples e intuitiva.

Modo claro e escuro.

Feedback visual ao salvar uma leitura.

Dashboard com resumo dos consumos.

Funcionalidades Principais

1. Dashboard Inicial

Exibir em formato de cards:

Bloco A

Bloco B

Bloco C

Bloco D

Cada card deverá mostrar:

Última leitura registrada.

Data da última leitura.

Consumo diário em m³.

Indicador de tendência de consumo.

2. Registro de Leitura

Para cada bloco, permitir duas formas de entrada:

a) Captura por Foto

Tirar uma foto do hidrômetro usando a câmera.

Utilizar OCR (reconhecimento de texto) para identificar automaticamente a leitura.

Permitir editar o valor reconhecido antes de salvar.

b) Digitação Manual

Campo numérico para informar a leitura.

3. Dados armazenados em cada leitura

Cada registro deverá conter:

Bloco (A, B, C ou D).

Data e hora da leitura.

Valor da leitura atual.

Valor da leitura anterior.

Consumo em metros cúbicos (m³), calculado automaticamente:

Consumo = Leitura Atual - Leitura Anterior

Nome do usuário responsável pela leitura.

Foto do hidrômetro (opcional).

Observações (opcional).

4. Gestão de Usuários

Criar autenticação com login e senha.

Cadastrar usuários com:

Nome completo.

E-mail.

Senha.

Toda leitura deverá registrar automaticamente qual usuário realizou o lançamento.

5. Histórico

Tela com histórico completo das leituras.

Filtros por:

Bloco.

Período.

Usuário responsável.

Exibir em tabela:

Data Bloco Leitura Atual Leitura Anterior Consumo (m³) Usuário

Permitir:

Editar leitura.

Excluir leitura.

Visualizar foto do hidrômetro.

6. Relatórios

Gerar relatórios por:

Dia.

Semana.

Mês.

Ano.

Exibir:

Consumo por bloco.

Média diária.

Total acumulado.

Gráficos interativos.

Permitir exportação para:

PDF.

Excel.

7. Notificações

Enviar alerta quando:

Não houver leitura do dia.

O consumo estiver muito acima da média.

Existirem diferenças anormais entre leituras.

8. Banco de Dados

Criar as tabelas:

Usuarios

id

nome

email

senha

Leituras

id

bloco

data_hora

leitura_atual

leitura_anterior

consumo_m3

foto_hidrometro

observacoes

usuario_id

Tecnologias sugeridas

Frontend:

React + TypeScript

Tailwind CSS

Shadcn UI

Backend:

Supabase

Recursos:

Supabase Authentication

Supabase Storage (armazenamento das fotos)

OCR para leitura automática dos números do hidrômetro

Estilo visual

Inspirado em:

Apple Human Interface

Notion

Stripe Dashboard

Priorizar uma experiência moderna, elegante, fluida e extremamente fácil de usar em dispositivos móveis, pois as leituras serão realizadas diariamente no condomínio.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://leitura-hidrometro.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/8a5cdf61-a2cb-4b07-8958-ea92050946a1).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
