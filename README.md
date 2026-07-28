# Carteira CAPEX — Dashboard Executivo (React + TypeScript)

Dashboard executivo de fluxo de caixa das Plataformas de Produção. Evolução do BI
atual (mesma identidade visual — fundo escuro, cards com gradiente sutil, badges de
risco coloridos, tooltips ⓘ), agora como aplicação web React/TypeScript que lê o
Excel diretamente no navegador.

**Nenhum dado financeiro é enviado a servidores externos** — todo o parsing e
cálculo acontece no cliente (SheetJS rodando no navegador).

## Instalação e execução local

```bash
cd capex-dashboard
npm install
npm run dev       # http://localhost:5173
```

Build de produção:

```bash
npm run build      # gera ./dist
npm run preview    # serve o build localmente para conferência
```

## Publicação (Vercel / Netlify)

- **Vercel**: `vercel --prod` na raiz do projeto, ou conecte o repositório Git e
  deixe o framework preset como "Vite" (build command `npm run build`, output
  `dist`). Não é necessária nenhuma variável de ambiente — o app não tem backend.
- **Netlify**: build command `npm run build`, publish directory `dist`. Também
  sem variáveis de ambiente.

## Como usar

1. Abra o app — a tela inicial pede o upload do Excel (`.xlsx`/`.xls`).
2. Envie o arquivo com as 4 abas: `Orçamento`, `Realizado`, `Hierarquia`, `Status Report`.
3. O filtro global de período (2026 / 2027 / Todos) aparece no topo, com **2026 como
   padrão**. Ele recalcula simultaneamente KPIs, gráficos, rankings, insights,
   matriz de risco, tabela e recomendações.
4. Use os filtros secundários (plataforma, gestor, aprovador, projeto, status,
   faixas de execução/comprometimento, busca textual) — todos combináveis.
5. Clique em qualquer linha da tabela ou item de ranking para abrir o
   detalhamento do projeto no painel lateral.
6. Exporte a visão filtrada em CSV a qualquer momento.

## Leitura e transformação do Excel

A camada de parsing (`src/lib/excelParser.ts`) trata as particularidades reais
identificadas na análise inicial:

- **Células mescladas**: as colunas `N4` (aba Orçamento) e `N4`/`1º Aprovador`
  (aba Realizado) são mescladas por bloco. O parser faz *forward-fill* — preenche
  a célula mesclada para as linhas seguintes até encontrar um novo valor.
- **Linhas de Total/subtotal**: identificadas pelo padrão "coluna hierárquica
  vazia + coluna seguinte = 'Total'" e sempre ignoradas nas análises por projeto
  (nunca somadas às linhas de detalhe, para não gerar dupla contagem).
- **Nomes**: o nome original do projeto é sempre preservado para exibição; a
  correspondência entre abas usa uma chave normalizada (sem acentos, espaços
  colapsados, minúsculas) só internamente.
- **Zero vs. vazio vs. não aplicável**: campos ausentes viram `null` (nunca
  `0` automaticamente) e aparecem como "Dados insuficientes" na classificação de
  risco e como "–" nas células da tabela.
- **Números em formato brasileiro**: o parser aceita tanto `1.234,56` quanto
  `1234.56` na conversão de texto para número (função `toNumberOrNull`).
- **Duplicidade de Compromisso entre 2026/2027**: o valor de `Compromisso` na
  aba Realizado se repete idêntico nas seções de cada ano do mesmo projeto — o
  parser deduplica (usa um único valor por projeto, nunca soma entre anos).
  Isso foi confirmado inspecionando o arquivo real: sem essa deduplicação, o
  compromisso total da carteira dobra de ~R$ 46,6M para ~R$ 93,3M.
- **Relatório de linhas ignoradas**: todo registro descartado (N4 não resolvido,
  compromisso divergente entre anos etc.) fica em `parsed.linhasIgnoradas` e é
  exibido na Área Técnica de Validação, no rodapé do dashboard.

### Verificação independente do parser

`scripts/validate-parser.mjs` e `scripts/validate-risk-estouro.mjs` reproduzem a
mesma lógica de leitura em Node puro (fora do React) e conferem os totais
contra os valores já publicados na aba Status Report:

```bash
node scripts/validate-parser.mjs
node scripts/validate-risk-estouro.mjs
```

## Regras de negócio implementadas

| Métrica | Fórmula |
|---|---|
| Executado | Realizado + Em Pagamento |
| % Execução | Executado ÷ Orçamento do período |
| % Comprometimento | Compromisso ÷ Orçamento do período |
| Falta comprometer | MAX(Orçamento do período − Compromisso, 0) |
| A emitir | Orçamento do período − Compromisso |
| Valor comprometido total | Executado + Compromisso |
| % Orçamento plurianual | Valor comprometido total ÷ Orçamento plurianual |
| Desvio plurianual | Valor comprometido total − Orçamento plurianual |
| Participação no risco | risco do projeto ÷ risco total da carteira filtrada |
| Ritmo necessário | valor restante ÷ meses restantes do período |

Todas as divisões são protegidas contra zero/`null` (`lib/metrics.ts::safeDiv`).

### Classificação de risco (ordem de prioridade)

1. 🔴 **Estouro** — Executado + Compromisso > orçamento plurianual
2. 🟠 **Baixo comprometimento** — Compromisso < 80% do orçamento do período **e**
   falta comprometer > R$ 50 mil (não avaliado para a Plataforma De Pré-Produção;
   "A emitir" negativo nunca conta como baixo comprometimento)
3. 🟡 **Baixa execução** — Execução < 40% do orçamento do período
4. 🟢 **OK** — nenhum dos riscos acima
5. ⚪ **Dados insuficientes** — quando não há orçamento em nenhuma fonte, ou
   execução/comprometimento não são calculáveis no período

## Filtro "2026 / 2027 / Todos os anos"

- **2026 / 2027**: usam exclusivamente o orçamento, realizado e em pagamento
  daquele ano específico (campos aditivos na aba Realizado).
- **Todos os anos**: soma 2026+2027 para orçamento/realizado/em pagamento, mas o
  **Compromisso permanece deduplicado** (não é somado — é o mesmo valor
  plurianual único). O orçamento plurianual (coluna Total Geral da aba
  Orçamento) é sempre exibido separadamente, nunca confundido com a soma
  2026+2027 recalculada.
- Os títulos das métricas mudam dinamicamente ("Orçamento 2026" / "Orçamento
  2027" / "Orçamento consolidado 2026–2027") e o período ativo aparece destacado
  na barra de contexto.

## Tokens visuais utilizados (fidelidade ao BI atual)

| Token | Valor | Uso |
|---|---|---|
| `bg` | `#0E1520` | Fundo principal |
| `card` / `card-alt` | `#121A26` / `#16202F` | Gradiente dos cards |
| `border` | `#22304A` | Bordas de cards e tabelas |
| `text` / `text-muted` / `text-faint` | `#E6EAF2` / `#8CA0BF` / `#6B85AD` | Hierarquia tipográfica |
| `accent` | `#3DA5F4` | Destaques, período ativo, links |
| `risk.critico` | `#C0392B` | 🔴 Estouro |
| `risk.alto` | `#E0672E` | 🟠 Baixo comprometimento |
| `risk.medio` | `#E0B429` | 🟡 Baixa execução |
| `risk.baixo` | `#2A9D6F` | 🟢 OK |
| `rounded-card` | `14px` | Raio de borda dos cards |

Todos centralizados em `tailwind.config.js` (tema) e reutilizados via classes
utilitárias — nenhuma cor "mágica" solta no meio dos componentes.

## Checklist de validação

- [x] Build de produção sem erros (`npm run build`)
- [x] Totais do parser conferidos em Node puro contra a aba Status Report
      (Orçamento 2026, Realizado+Em Pagamento 2026, Compromisso deduplicado)
- [x] Contagem de projetos processados (209 chaves únicas = 181 só-Orçamento ∪
      205 só-Realizado, com sobreposição de 177)
- [x] Ausência de dupla contagem de Compromisso entre 2026/2027 confirmada
- [x] Classificação "Estouro" (plurianual) validada isoladamente (40 projetos)
- [ ] Teste manual em navegador real com o arquivo do usuário (não foi possível
      automatizar neste ambiente por falta de um browser headless disponível —
      recomenda-se conferência visual antes da reunião com a diretoria)
- [ ] Conferência visual de fidelidade ao BI atual lado a lado (recomenda-se
      comparar com o Streamlit publicado)

## Limitações conhecidas / não inferíveis

- A aba Realizado **não contém a Plataforma De Pré-Produção nem os projetos
  "Produção Remota para Missa SP" e "Globo Midia"** — são filtros já aplicados
  na própria planilha de origem (confirmado via metadados internos do arquivo),
  não uma falha de leitura. Esses 4 projetos aparecem no dashboard com métricas
  de execução/comprometimento como "Dados insuficientes", mas seu orçamento
  plurianual é preservado nos totais.
- A "Evolução Mensal" usa a divisão H1×H2 de 2026 disponível na aba Orçamento
  (dado real, não fictício) em vez de uma série de 12 pontos, porque o dataset
  consolidado no runtime não retém o detalhe mês a mês por projeto após o
  cálculo de métricas — está documentado como limitação no próprio gráfico.
- O logotipo do BI atual não estava disponível como arquivo separado nesta
  conversa (só capturas de tela) — o cabeçalho usa um ícone (📊) como
  aproximação; substitua por um SVG do logo real se disponível.
