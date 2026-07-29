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
