## Objetivo
Transformar a análise de IA em um relatório técnico, bonito e profissional, com estrutura inspirada nos padrões ABNT e foco objetivo em anomalias de consumo.

## Mudanças

### 1. Regra objetiva de anomalia
- Calcular no servidor a média diária de cada bloco, ignorando somente a leitura inicial sem base anterior.
- Identificar e fornecer à IA todas as leituras cujo consumo seja superior a **130% da média do bloco**.
- Mostrar data, consumo registrado, média de referência e percentual excedido.
- Não classificar como anomalia de alta apenas por interpretação quando o limite de 30% não tiver sido atingido.

### 2. Documento técnico no padrão ABNT
A resposta será organizada como um relatório com:
- identificação do Condomínio Residencial Terra do Sol;
- título e período analisado;
- resumo executivo;
- metodologia e critério de 30%;
- resultados por bloco;
- anomalias confirmadas;
- dicas práticas;
- observações técnicas;
- conclusão e data de geração.

A apresentação na tela terá hierarquia tipográfica, seções numeradas, tabela de anomalias, indicadores de atenção e acabamento visual sóbrio. O documento será descrito como “formatação inspirada em ABNT”, pois elementos como capa, paginação e margens completas dependem da exportação/impressão.

### 3. Exportação profissional
- Incluir a análise de IA na versão para impressão/PDF quando ela já tiver sido gerada.
- Aplicar página A4, margens acadêmicas, tipografia legível, cabeçalho, rodapé e numeração de páginas.
- Preservar os gráficos e tabelas atuais, reorganizando-os para leitura profissional.

### 4. Compatibilidade e validação
- Manter o fluxo atual de seleção de período e geração por IA.
- Adaptar o interpretador do relatório para o novo formato sem perder compatibilidade com respostas anteriores.
- Validar o cálculo do limite de 30%, a exibição e a impressão/PDF.

## Detalhes técnicos
- O cálculo numérico será feito antes da chamada de IA para evitar que o modelo invente médias ou percentuais.
- A IA receberá um resumo determinístico das anomalias e ficará responsável pela redação das conclusões, dicas e observações.
- Erros do serviço de IA serão exibidos com a mensagem segura retornada pelo serviço, sem resposta genérica.
