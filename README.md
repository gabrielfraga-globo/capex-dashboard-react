# Radar Executivo — Carteira CAPEX (React + TypeScript)

Redesenhado como **Radar Executivo**, não como BI analítico: a tela inicial responde
em menos de 30 segundos "como está a saúde da carteira, onde estão os riscos, quanto
dinheiro está exposto e o que fazer" — o detalhe fica escondido até ser pedido
(Progressive Disclosure / Bento Grid).

## Instalação e execução local

```bash
cd capex-dashboard
npm install
npm run dev       # http://localhost:5173
```

```bash
npm run build      # gera ./dist
npm run preview    # serve o build localmente para conferência
```

## Publicação (Vercel / Netlify)

Sem mudanças em relação à versão anterior — build `npm run build`, output `dist`,
sem variáveis de ambiente.

## Arquitetura de informação (3 camadas)

### Camada 1 — Resumo Executivo (sempre visível, sem scroll)
- **Financeiro**: Orçamento do período, Compromisso, Realizado, A Emitir (4 KPIs, só isso)
- **Saúde da Carteira**: 4 chips — 🔴 Estouro, 🟠 Baixo Comprometimento, 🟡 Baixa Execução, 💰 Risco Financeiro (R$)
- **Destaques**: Top 5 Ofensores + Top 3 Insights (1 frase cada)

### Camada 2 — Bento Grid (recolhível)
- **Matriz de Risco** (Execução × Comprometimento) é a protagonista — sempre expandida,
  maior, com clique no ponto abrindo o painel lateral direto.
- Demais cartões **fechados por padrão**, expandem ao clicar: Plataformas em Atenção,
  Distribuição de Status, Projetos Prioritários, Plano de Ação, Detalhamento Completo.

### Camada 3 — Painel Lateral
Clique em qualquer projeto (matriz, ofensores, rankings, plano de ação ou tabela) abre
o detalhamento sem poluir a tela principal.

### Modo Auditoria (oculto por padrão)
Questões de qualidade de dados ("dados insuficientes", linhas ignoradas, divergências
vs. Status Report) **não aparecem na visão executiva**. Ficam atrás do botão
"Modo Auditoria" no cabeçalho — uso interno do time de Performance, não da diretoria.

## O que foi removido / transformado (vs. versão anterior)

| Antes | Agora |
|---|---|
| Upload manual de Excel (drag & drop) | Leitura automática de `/public/data/carteira.xlsx` — sem ação do usuário |
| Insights em parágrafo (conclusão + valor + comparação + impacto + ação) | 1 frase por insight, com número e emoji |
| "Dados insuficientes" visível na tela principal | Só aparece no Modo Auditoria |
| ~10 filtros sempre visíveis | Chips de status + busca; resto em "Filtros avançados" (fechado) |
| Gráfico de evolução semestral | Removido (baixo valor informativo) |
| Matriz de risco como 1 gráfico entre outros 5 | Matriz como componente-herói, sempre visível, maior |
| Tabela sempre visível | Dentro do cartão recolhível "Detalhamento Completo" |

## Fonte de dados — camada de abstração

```ts
// src/lib/dataSource.ts
export async function loadPortfolioData(): Promise<RelatorioParsing>
```

**Hoje**: faz `fetch('/data/carteira.xlsx')` (arquivo em `public/data/`, substituído
mensalmente por um fluxo automatizado — sem rebuild da aplicação, já que `/public` é
servido como está).

**Futuro (BigQuery)**: troca-se só o corpo desta função por uma query + mapeamento de
linhas para `ProjetoBase[]`. Nenhum componente visual depende de como os dados chegam.

> O arquivo bundled em `public/data/carteira.xlsx` ainda traz as 4 abas num único
> workbook (Orçamento/Realizado/Hierarquia/Status Report), pois é assim que a fonte
> atual é gerada. Quando o fluxo mensal passar a gerar `carteira.xlsx` / `status.xlsx`
> / `hierarquia.xlsx` separados, ajustar apenas a lógica de fetch/parse dentro de
> `dataSource.ts` — a assinatura de `loadPortfolioData()` não muda.

## Funções reutilizáveis (dashboard hoje, e-mail/Copilot amanhã)

`src/lib/insights.ts` expõe funções puras, sem dependência de React, prontas para
alimentar tanto o dashboard quanto um futuro e-mail executivo mensal ou agente Copilot:

```ts
generateExecutiveSummary(lista) → { headline, orcamentoPeriodo, executado, compromisso, aEmitir, pctExecucao }
generateRiskSummary(lista)      → { estouro, baixoComprometimento, baixaExecucao, riscoFinanceiroTotal }
generateTopOffenders(lista, n)  → ProjetoMetricas[]
generateActionPlan(lista)       → { acao, projetos, total }[]
generateInsights(lista)         → string[]  // no máximo 3, 1 frase cada
```

Um script de e-mail mensal (ou o agente Copilot) pode importar essas mesmas funções,
rodar sobre a mesma `RelatorioParsing`, e montar o corpo da mensagem — sem duplicar
nenhuma regra de negócio.

## Regras de negócio e classificação de risco

Sem mudanças na lógica em relação à versão anterior (documentado em detalhe no
histórico do projeto): Estouro = Executado+Compromisso > orçamento plurianual;
Baixo Comprometimento = Compromisso < 80% do orçamento do período E falta
comprometer > R$ 50 mil (exceto Pré-Produção); Baixa Execução = Execução < 40%.
O que mudou foi **onde e como isso aparece**, não o cálculo em si.

## Checklist de validação

- [x] Build de produção sem erros (`npm run build`)
- [x] Lint limpo (`npx oxlint src` — 0 avisos/erros)
- [x] `npm run preview` servindo `index.html` (200) e `data/carteira.xlsx` (200)
- [x] Checksum do arquivo bundled idêntico ao arquivo de origem
- [ ] Teste manual em navegador real (recomenda-se antes da reunião com a diretoria)

## Correções de regra de negócio (revisão da área de Performance)

### 1. "A Emitir" corrigido
Fórmula anterior (incorreta): `Orçamento − Compromisso`.
**Fórmula correta, agora implementada em `metrics.ts`**: `Orçamento − Compromisso − Realizado`.
Validado: `Realizado + Compromisso + A Emitir = Orçamento` exatamente, para 100% dos
projetos (script `scripts/validate-business-rules.mjs`). Todas as funções que usavam
o saldo a emitir (ofensores, risco financeiro, exposição, plano de ação) foram
atualizadas para a mesma definição.

> Nota de transparência: a fórmula não subtrai "Em Pagamento" — seguindo literalmente
> a regra informada. Se "Em Pagamento" também devesse reduzir o saldo a emitir, é um
> ajuste de uma linha em `metrics.ts`.

### 2. Score de risco proporcional
Antes, o ranking de "ofensores" usava valor absoluto (R$), o que fazia um projeto de
R$10M com R$8M a emitir parecer igual a um de R$100M com R$8M a emitir — mesmo o
primeiro sendo claramente mais arriscado proporcionalmente.

Novo `calculateRiskScore()` em `metrics.ts` (0 a 1, Estouro sempre = 1):
```
score = (0.30·(1−%Comprometido) + 0.25·(1−%Executado) + 0.25·(%AEmitir) + 0.20·porte)
        × fatorUrgência(meses restantes do período)
```
`porte` usa escala logarítmica (não deixa 1 projeto gigante dominar o ranking, mas
ainda conta). `fatorUrgência` aumenta conforme o período se aproxima do fim (o mesmo
% de risco em novembro é mais grave que em fevereiro).

### 3. Insights — 3 a 5 por padrão
`generateExecutiveInsights()` volta a gerar de 3 a 5 frases (era só 3), mantendo o
limite de 1 linha cada.

### 4. Matriz de Risco corrigida
- Eixos trocados: **X = % Comprometimento, Y = % Execução** (estava invertido).
- Domínio fixo 0–100%, com piso de materialidade de R$ 50 mil — projetos com
  orçamento menor que isso geravam percentuais de milhares de % (denominador
  minúsculo) e distorciam a escala inteira. Esses projetos continuam contando
  normalmente em todos os KPIs e na tabela; só não entram nesse gráfico específico.
- Para os poucos casos legítimos acima de 100% (ex.: compromisso multi-ano
  comparado a um único período), o ponto é fixado visualmente em 100% mas o
  tooltip mostra o valor real, sem esconder a informação.
- Quadrantes com rótulo (🟢 OK / 🟡 Executado sem compromisso / 🟡 Comprometido mas
  pouco executado / 🔴 Baixa execução e comprometimento), usando os mesmos limiares
  já usados nas regras de risco (80% comprometimento, 40% execução).
- Projetos em Estouro recebem contorno branco para destaque visual específico.

### 5. "Progresso por Plataforma" → composição 100% empilhada
Substituído o gráfico de barras agrupadas (difícil de ler) por uma barra 100%
empilhada por plataforma: Executado + Comprometido + A Emitir, cada uma como fatia
do orçamento — o diretor vê de imediato quem já gastou, quem já contratou e quem
ainda depende de contratação, sem interpretar percentuais isolados.

### 6. Bento Grid — Matriz de Risco volta a ser um cartão
A Matriz de Risco deixou de ser um componente "hero" fixo e voltou a ser um cartão
da Camada 2 — mas **expandido por padrão** (`defaultOpen`), enquanto os demais
(Plataformas em Atenção, Projetos Prioritários, Plano de Ação, Distribuição de
Status, Detalhamento Completo) continuam fechados por padrão.

### 7. Funções reutilizáveis (nomes exatos para o futuro Copilot)
`lib/insights.ts` agora exporta exatamente:
```ts
generateExecutiveInsights(lista) → string[]           // 3-5 frases, 1 linha cada
generateTopOffenders(lista, n)   → ProjetoMetricas[]   // ranqueado por riscoScore
generateRiskSummary(lista)       → RiskSummary
generatePlatformHighlights(lista)→ PlatformHighlight[] // novo — base do cartão de plataformas
```
Um script de e-mail mensal ou o agente Copilot pode importar essas mesmas funções e
consumir exatamente os mesmos números que aparecem no dashboard.

## Segunda rodada de correções (auditoria formal antes de aplicar)

Nesta rodada, o processo foi: **auditar primeiro, corrigir só após confirmação explícita**.

### 1. "A Emitir" corrigido (de novo) — agora com validação cruzada
A fórmula de 3 termos da rodada anterior (`Orçamento − Compromisso − Realizado`, sem Em
Pagamento) foi confirmada como INCORRETA ao reproduzir o exemplo real "Gnews no estúdio A":
gerava R$ 90.791 (positivo, "ainda dá para contratar"), enquanto a própria coluna "A Emitir"
já existente na planilha-fonte (calculada pelo sistema da área) mostra **R$ -3.335,78** para
esse mesmo projeto/período.

**Fórmula corrigida e confirmada**: `Orçamento − Executado − Emitido` (onde Executado =
Realizado + Em Pagamento). Validado três vezes:
- Reproduz exatamente os R$ -3.335,78 do exemplo Gnews.
- O total plurianual da carteira (R$ 151.362.536,26) bate **exatamente** com o valor
  oficial já publicado na aba Status Report.
- Script de verificação: `scripts/validate-final-formula.mjs`.

### 2. "Todos os anos" usa o orçamento plurianual consolidado
Antes: somava `orçamento 2026 + orçamento 2027` (ambos vindos da aba Realizado).
Agora: usa diretamente `orcamentoPlurianual` (aba Orçamento, Total Geral) — nunca mais
mistura as duas granularidades.

### 3. "Falta Comprometer" removido
M�trica considerada vaga demais para orientar ação (não distinguia dinheiro parado por
falta de contrato de dinheiro que já foi gasto por outra via). Removida de: tipos,
tabela detalhada, exportação CSV, painel lateral, rankings (o ranking correspondente
foi removido) e do cálculo de Risco Financeiro (que agora usa A Emitir diretamente para
os riscos de Baixo Comprometimento/Baixa Execução, e o desvio plurianual para Estouro).

### 4. Terminologia: "Emitido" em vez de "Compromisso"/"Contratado"
Todo rótulo visível na interface (KPIs, tabela, painel lateral, matriz de risco, filtros)
que se referia ao valor já formalizado em contrato/PO passou a usar **"Emitido"**
consistentemente — a categoria de risco "Baixo Comprometimento" (nome formal do status)
não foi alterada, só a terminologia usada para o valor/percentual em si.

### 5. Tooltips obrigatórios adicionados
Ícone ⓘ com explicação em linguagem simples (sem "ETL", "pipeline", "dataframe" etc.) em:
Orçamento, Orçamento Plurianual, Emitido, Realizado/Executado, A Emitir, % Execução,
% Emitido, Risco Financeiro (nos 4 chips de saúde da carteira) e Ritmo Necessário (no
painel lateral). Os cards de KPI financeiro também mostram a "memória de cálculo" como
subtítulo (ex.: A Emitir mostra "Orçamento − Executado − Emitido" com os 3 valores).

## Terceira rodada — reformulação conceitual (Cobertura Financeira)

Esta rodada não foi sobre corrigir uma fórmula errada, mas sobre **mudar a lente de risco**:
de "estourou ou não" para "quanto do orçamento já entrou no fluxo financeiro".

### Novo fluxo conceitual
```
Orçamento → Emitido → Em Pagamento → Realizado
```

### Novas métricas
- **Cobertura Financeira** = `(Executado + Emitido) ÷ Orçamento` — parcela do orçamento já
  movimentada, seja como gasto ou como contrato.
- **Exposição Financeira** = soma do excedente dos projetos em Estouro + o saldo ainda sem
  cobertura dos demais projetos em risco (R$).
- **Projetos Críticos** = contagem de Estouro + Risco de Não Realização.

### Nova classificação de risco (substitui Baixo Comprometimento / Baixa Execução / OK)
1. 🔴 **Estouro** — inalterado (Executado+Emitido > Orçamento Plurianual), sempre prioridade máxima.
2. 🔵 **Revisão Financeira** — A Emitir negativo no período (mais foi executado/emitido do
   que o orçamento do período, mas sem violar o plurianual). **Não é tratado automaticamente
   como problema** — pode ser timing, replanejamento ou apropriação futura. Precisa de olhar
   humano, não de alarme automático.
3. 🟠 **Risco de Não Realização** — mais de 30% do orçamento do período ainda sem cobertura financeira.
4. 🟡 **Atenção** — entre 10% e 30% sem cobertura.
5. 🟢 **Coberto** — 10% ou menos sem cobertura.

Validado contra os dados reais de 2026 (`scripts/validate-cobertura.mjs`): 59 Estouro, 65
Risco de Não Realização, 20 Atenção, 28 Coberto, 12 Revisão Financeira, 25 Dados
insuficientes — soma exatamente os 209 projetos da carteira. Cobertura Financeira agregada
da carteira 2026: **62,7%**.

### KPIs executivos reorganizados
Linha 1 (financeiro): Carteira, Emitido, Executado, A Emitir.
Linha 2 (saúde/risco): Cobertura Financeira, Exposição Financeira, Projetos Críticos.
O antigo destaque em "Estouro" como headline dominante foi rebalanceado — a frase executiva
do topo agora prioriza Cobertura Financeira/Risco de Não Realização quando não há estouro,
refletindo que "não executar o orçamento" é o risco mais frequente da área.

### Rankings atualizados
"Menor Execução" foi substituído por **"Menor Cobertura Financeira"**, alinhado à nova ótica.

### Nota de simplificação
A antiga regra de exceção para a Plataforma De Pré-Produção (excluída apenas da checagem de
"baixo comprometimento") não tem mais equivalente direto no novo modelo proporcional — foi
removida por ora. Se necessário, dá para reintroduzir uma regra de materialidade específica
para essa plataforma.

## Quarta rodada — Radar Executivo (menos métricas, mais decisão)

Princípio aplicado: **mostrar apenas o necessário, explicar apenas sob demanda.**

### Primeira dobra reduzida
A tela inicial agora responde só 5 perguntas: Orçamento, Executado, Emitido, A Emitir, e
Saúde Geral (1 frase, ex.: "🟢 Carteira saudável."). Tudo mais — Cobertura Financeira,
Exposição Financeira, Projetos Críticos, Top Ofensores, Insights, Matriz de Risco,
Distribuição por Plataforma, Rankings, Plano de Ação, Tabela — está em cartões
recolhíveis, **todos fechados por padrão** (inclusive a Matriz de Risco, que antes ficava
sempre expandida).

### Textos com no máximo 8 palavras
Frase de saúde geral e todos os insights foram reescritos para caber nesse limite —
ex.: "💰 R$88M fora do fluxo financeiro." em vez do parágrafo anterior.

### Nomenclatura neutra
"Plataformas em Atenção" → **"Distribuição Financeira por Plataforma"** — o cartão
apresenta a composição do orçamento por plataforma, não pressupõe problema.

### Novo modelo de risco: cobertura + tempo (não mais % isolado)
Simplificado de 6 estados para 4: **Estouro**, **Risco de Não Realização**, **Normal**,
**Dados insuficientes**.

**Risco de Não Realização agora exige as duas condições ao mesmo tempo**:
- Cobertura Financeira < 95%, **e**
- Menos de 6 meses para o fim do exercício selecionado.

Fora dessa janela de tempo, mesmo uma cobertura baixa é considerada **Normal** — há tempo
hábil para resolver, não é risco ainda. Isso elimina o falso alarme de sinalizar um
projeto como "em risco" logo no início do ano, quando ele ainda tem o ano inteiro pela
frente para emitir/executar.

Validado contra os 209 projetos reais de 2026 (`scripts/validate-time-gated-risk.mjs`,
considerando a data-base de julho/2026, portanto já dentro da janela de 6 meses): 59
Estouro, 86 Risco de Não Realização, 39 Normal, 25 Dados insuficientes — soma exatamente
209.

## Quinta rodada — duas experiências complementares

### Radar Executivo × Auditoria da Carteira

A aplicação agora tem **duas telas com navegação clara** (botões no cabeçalho):

- **Radar Executivo** (tela padrão ao abrir): responde só 4 perguntas — estamos
  executando o plano? qual o delta YTD? quais projetos exigem ação? quais precisam
  revisão de fluxo de caixa? Nenhuma métrica técnica aparece aqui — sem cobertura
  financeira, sem Emitido, sem Em Pagamento, sem Matriz de Risco, sem fórmulas, sem
  tabela. Reduz bem mais que 70% da informação visível em relação à Auditoria.
- **Auditoria da Carteira**: toda a riqueza analítica já construída nas rodadas
  anteriores (4 KPIs financeiros, Destaques, Matriz de Risco, Distribuição por
  Plataforma, Rankings, Plano de Ação, Tabela completa, Validação Técnica).

Clicar em um projeto no Radar Executivo abre o painel lateral (que tem detalhe
técnico) e **automaticamente muda para a Auditoria** — o usuário decide entrar no
detalhe, a informação técnica não aparece "de graça" no Radar.

### Novo KPI principal: Delta YTD
```
Delta YTD = Planejado Acumulado − Realizado Acumulado
```
- **Planejado Acumulado**: soma do orçamento mensal (aba Orçamento) até o mês
  corrente — usa o detalhe mês a mês real quando disponível; para os poucos
  projetos que só existem na aba Realizado (sem detalhe mensal), aproxima por
  regra de três sobre o total do ano (documentado como aproximação).
- **Realizado Acumulado**: o campo "Realizado" já é acumulado por natureza (é o
  valor reconhecido até a data-base).

Validado contra os dados reais (base julho/2026, `scripts/validate-delta-ytd.mjs`):
Planejado Acumulado R$ 51,35M, Realizado Acumulado R$ 48,63M, **Delta YTD = +R$
2,72M** (positivo = atrás do plano). Assumi que "Realizado" no cálculo é o campo
puro (sem Em Pagamento) — se a área considerar Em Pagamento parte do "realizado
acumulado", é uma troca de uma linha em `metrics.ts`.

### Estouro — fórmula revisada (mais rigorosa)
Antes: `Executado + Emitido > Orçamento Plurianual` (contava contrato, não só gasto).
**Agora**: `Realizado + Em Pagamento > Orçamento Plurianual` — só dinheiro
**realmente gasto**, o Emitido não entra mais nessa conta. Validado: a contagem de
projetos em Estouro cai de 59 (regra antiga) para **10** (regra nova) — bem mais
rigorosa e rara, como esperado ao remover o componente de compromisso contratual.

### Novo status: Revisão de Fluxo de Caixa
Substituiu o "Revisão Financeira" de uma rodada anterior, com significado mais
preciso: **A Emitir negativo no período, sem violar o plurianual** — sinaliza
potencial necessidade de antecipar ou postergar orçamento entre exercícios. Não é
tratado como alarme automático (segue a mesma filosofia de "precisa de contexto,
não é problema garantido").

### Classificação final — 5 estados
1. 🔴 Estouro (Realizado+Em Pagamento > Orçamento Plurianual)
2. 🔵 Revisão de Fluxo de Caixa (A Emitir do período < 0)
3. 🟠 Risco de Não Realização (Cobertura < 95% E < 6 meses para o fim do exercício)
4. 🟢 Normal
5. ⚪ Dados insuficientes

## Sexta rodada — Decision Hub (Bento premium, tema claro/escuro)

### Delta YTD — base e sinal corrigidos
Antes: `Planejado − Realizado` (Realizado puro, sem Em Pagamento).
**Agora**: `Executado Acumulado − Planejado Acumulado`, onde `Executado = Realizado + Em
Pagamento`. Sinal invertido: **negativo = atrás do plano, positivo = à frente**.
Validado (`scripts/validate-delta-ytd-v2.mjs`, base julho/2026): Planejado R$ 51,35M,
Executado R$ 53,75M, **Delta YTD = +R$ 2,40M** (à frente do plano).

### Radar Executivo — Bento Grid fixo (sem accordion)
Reescrito por completo: card hero "Execução do Plano" (Planejado/Executado/Delta YTD +
status), Saúde da Carteira (3 estados: Dentro do plano/Acompanhar/Requer ação), Insight
do Ciclo (3-4 frases), Projetos para Decisão, Revisão de Fluxo — tudo visível sem
nenhum clique. Filtro simplificado: Ano (compartilhado) + toggle Todos/Projetos para
Ação/Revisão de Fluxo + busca — nada de filtros avançados aqui (só na Auditoria).

### Copywriting executivo
"Top 5 Ofensores" → "Projetos para Decisão" · "Exposição Financeira" → "Ajuste de
Fluxo" · "Projetos Críticos" → "Projetos para Ação" · "Plataformas em Atenção" →
"Composição por Plataforma".

### Tema claro/escuro
Implementado via CSS custom properties (`index.css`, `[data-theme="light"|"dark"]`),
`themeStore.ts` (zustand + persistência em localStorage) e `ThemeToggle.tsx`. Aplicado
antes do primeiro render (`main.tsx`) para não piscar o tema errado ao carregar.

**Bug real encontrado e corrigido**: cores baseadas em variável CSS (`accent`, o
gradiente do hero) quebravam silenciosamente ao usar modificador de opacidade do
Tailwind (`bg-accent/10`, `from-gradA/90` etc.) — a classe simplesmente não era gerada.
Corrigido armazenando `--color-accent` como tripla RGB (`124 143 224`) e referenciando
via `rgb(var(--color-accent) / <alpha-value>)` no `tailwind.config.js`, que é o padrão
que o Tailwind exige para opacidade funcionar com variáveis CSS. Confirmado inspecionando
o CSS gerado.

**Gráficos (Recharts) também tornados sensíveis ao tema**: como esses componentes
recebem cor como string literal via props (não classe Tailwind), criei
`lib/chartColors.ts` com paletas para os dois temas, aplicado em `Diagnostics.tsx`,
`RiskMatrix.tsx` e `ProjectSidePanel.tsx`.

### Identidade visual
Ícone de marca novo (`BrandMark.tsx`, SVG radar abstrato com gradiente lilás→azul),
substituindo o emoji de gráfico genérico.

### Responsividade
Bento em coluna única no mobile (empilha), cabeçalho com `flex-wrap`, linha de números
do hero em coluna única abaixo do breakpoint `sm`.

## Sétima rodada — refinamento do Radar Executivo

### 1. Título
"Carteira CAPEX" → **"Carteira de Investimentos"**, com subtítulo "Radar Executivo ·
Plataformas de Produção" (ou "Auditoria da Carteira · Plataformas de Produção").

### 2. Filtros escondidos por padrão no Radar
Período, o toggle Todos/Projetos para Ação/Revisão de Caixa e a busca agora ficam
atrás de um botão "Filtros" (fechado por padrão). Só a Auditoria mantém o seletor de
período sempre visível.

### 3. Card "Execução do Plano" evoluído
Adicionado um gráfico de linha simples (Planejado × Realizado acumulado, mensal, sem
grid pesado, poucos rótulos) dentro do próprio card. **Limitação de dados honesta**: a
fonte não guarda o Realizado mês a mês — só o total acumulado até a data-base. A linha
"Planejado" usa o dado mensal real (aba Orçamento); a linha "Realizado" é uma reta
interpolada do início do ano até o total conhecido no mês corrente (documentado no
próprio código). Os 2-4 insights do ciclo foram movidos para **dentro** deste card
(deixaram de ser um bloco separado), narrando diretamente os números acima.

### 4. "Saúde da Carteira" com projetos + valor, clicável
Antes mostrava só uma contagem solta. Agora cada um dos 3 estados mostra **nº de
projetos e R$ de orçamento**, e é clicável (aplica o filtro correspondente). Baldes:
Dentro do Plano (Normal), Acompanhar (Revisão de Caixa), Requer Ação (Estouro + Risco
de Não Realização).

### 5. Insights conectados ao Delta YTD
Novo `generateRadarInsights()` deriva as frases diretamente do Planejado/Executado/
Delta e da concentração por plataforma — sem mencionar cobertura financeira ou saldo a
emitir (esses ficam só na Auditoria, em `generateExecutiveInsights()`, mantido intacto).

### 6. Renomeação
"Revisão de Fluxo (de Caixa)" → **"Revisão de Caixa"** em todo o app (badge, filtro,
matriz, legendas) — o card específico do Radar usa "Revisar Caixa do Ano" (forma mais
executiva/de ação).

### 7. Bug de navegação corrigido
Selecionar um projeto no Radar **não muda mais a tela para Auditoria** — o painel
lateral abre como overlay sobre o Radar, e fechar volta exatamente pro Radar. (Antes,
a seleção trocava a view inteira para Auditoria, quebrando o contexto de navegação.)

### 9. Primeira dobra reduzida ainda mais
"Insight do Ciclo" deixou de ser um bloco à parte (fundido no card "Execução do
Plano"), então a primeira dobra agora tem exatamente os 5 blocos pedidos: Hero, Execução
do Plano, Saúde da Carteira, Projetos para Decisão, Revisar Caixa do Ano.
