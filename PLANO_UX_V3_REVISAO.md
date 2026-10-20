# Plano de Implementação — Revisão UX v3 (Visão Executiva, Curadoria, Classificação, Risco de Caixa)

> **Projeto:** `capex-dashboard-react` · branch nova `feat/ux-v3` a partir da atual
> **Base:** pedido de revisão de 19/10/2026 · `PLANO_UX_V2_IMPLEMENTACAO.md` (decisões V1–V6 e F1) · `RADAR_V1_COPILOT_PROMPT.md`
> **Data:** 19/10/2026 · arquiteto: Claude · implementação: GitHub Copilot (modo Agent; F0 em modo Ask)

Coloque este arquivo na raiz do repositório e referencie-o com `#file:PLANO_UX_V3_REVISAO.md` em todos os prompts.

---

## 0. Leitura de especialista (o que muda e por quê)

A tela de diretoria precisa responder em 5 segundos a três perguntas: **quanto saiu, quanto ainda vai sair este ano e onde agir.** Hoje a Visão Executiva gasta espaço com detalhe de auditoria (faixa de saldo potencial) e o gráfico mais importante, o Fluxo de Caixa, fica comprimido.

| # | Pedido | Leitura | Decisão neste plano |
|---|---|---|---|
| 1 | Saldo Potencial vira verso do card "Em risco" | Bom par narrativo: **frente = pressão** (RCs que podem não virar caixa), **verso = folga** (saldo parado para remanejar). | Flip card com botão explícito, não hover (seção 2.1). A faixa sai da tela. |
| 2 | Composição por Plataforma no verso do Fluxo | Responde "de onde vem o caixa" sem outro bloco. | Flip no card Fluxo de Caixa; 4 plataformas em barras horizontais. |
| 3 | Regra Compromisso 26/27 | A regra é de **data de pagamento estimada**, não de empenho. Tem 3 ambiguidades sérias (seção 3). | Explicação visível no card (ⓘ + decomposição). Correção da regra fica para depois da sua decisão. |
| 4 | Ocultar "Não Informada" na Rubrica | Só esconde a opção. Os totais não mudam: "Todas" = sem filtro. | Fase E5, com teste de invariância. |
| 5 | Curadoria por natureza do item (A/M × E/S/L) e % 2026/2027 | **O código do item não existe em nenhuma extração atual** (`compromissos_detalhados` não tem coluna de item). Precisa de coluna nova no DAX. | Fase C dividida: C1 depende de você informar a coluna do BI. C2/C3 seguem com natureza "Não identificada" até lá. |
| 6 | Tabela da Classificação: cabeçalho fixo + rolagem horizontal visível | O container da tabela precisa rolar nos dois eixos, com altura limitada à janela. | Fase T1. |
| 7 | Renomear "Risco de Caixa e Rubricas" para "Auditoria" | **Conflito:** o app já tem uma tela "Auditoria" (Área Técnica de Validação, com store próprio), e o card do item 1 vira "Auditoria de Saldos". Seriam três coisas com o mesmo nome. | Os rótulos vão para um arquivo único de constantes (E1). Recomendação na seção 6, decisão N1. |

### Ganhos adicionais propostos (entram nas fases indicadas)

- **E3:** com a faixa de saldo fora, o Fluxo de Caixa ocupa a largura toda da linha (hoje divide espaço).
- **E6:** o card "Compromisso 27" mostra de onde vem o número (data após 31/12 · sem data prevista · decisão do gestor). Hoje um item **sem data** cai em 27 sem ninguém ver.
- **T1:** a primeira coluna (RC) também fica fixa na rolagem horizontal. Sem isso, o usuário perde a referência da linha.
- **C3:** o rateio 2026/2027 usa atalhos (100/75/50/25/0) em vez de dois campos livres. A soma de 100% é garantida por construção (2027 = 100 − 2026).

---

## 1. Invariantes (o que NÃO pode mudar)

| Item | Regra |
|---|---|
| `carteira-processed.json`, `radar-bundle.json`, `saldo-projetos.json` | Idênticos (exceto `generatedAt`) até a fase C1. Só C1 muda o bundle, e de forma aditiva (campo opcional). |
| Valores dos cartões e KPIs | Nenhum número muda nas fases E1–E6 e T1. Só layout, rótulos e explicação. |
| `suggestClassification`, `classificationFromDecision`, `suggestPaymentDate` | Nenhuma linha alterada neste plano (a correção da regra depende da decisão N2). |
| Filtro de rubrica | "Todas" (nenhuma selecionada) devolve a lista sem filtro, como hoje (`aplicarFiltroRubrica`). |
| Curadorias já gravadas | Continuam legíveis. Os campos novos são opcionais e `null` = comportamento atual. |
| Testes | `npm test` verde. Um teste existente só muda se o prompt disser qual e por quê. |
| `public/data/*` | Depois de `npm run build`, rodar `git checkout -- public/data` (nunca commitar os JSON regenerados). |
| Cor | Vermelho só para exceção. Nunca verde para "acima do orçamento". Tokens existentes, sem hex. |

---

## 2. Especificação de UX

### 2.1 Componente `FlipCard` (genérico)

```ts
interface FlipCardProps {
  front: ReactNode;
  back: ReactNode;
  frontLabel: string;        // ex.: "Em risco"
  backLabel: string;         // ex.: "Saldo parado"
  defaultSide?: "front" | "back";
  className?: string;
}
```

- **Gatilho:** botão no canto superior direito com ícone `RefreshCw` e o nome do **outro** lado ("Ver saldo parado ↻"). Nada de hover: no hover o conteúdo some sem querer e não funciona em toque.
- **Acessibilidade:** `<button aria-pressed>`; a face oculta tem `aria-hidden="true"` e `inert`; o foco vai para o título da face nova.
- **Movimento:** rotação Y de 400 ms. Com `prefers-reduced-motion: reduce`, troca por fade de 150 ms.
- **Altura:** as duas faces na mesma célula de grid (`grid-area: 1/1`). O card fica com a altura da maior face e não pula.
- **Estado:** local, não persiste (cada visita começa na frente).

### 2.2 Visão Executiva (aba 2026)

```
┌ cartões (V2): BG Gov 26 · Realizado 26 · Em pagamento · Compromisso 26 ⓘ · Compromisso 27 ⓘ · [Em risco ↻] ┐
├──────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ [Fluxo de Caixa ↻]   largura total, altura +40%                                                           │
│   verso: Composição por Plataforma                                                                        │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Execução do Plano · Ritmo · demais blocos (inalterados)                                                   │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Card "Em risco", verso "Auditoria de Saldos"** (rótulo de `LABELS.saldoParadoCard`), no máximo 4 elementos:
1. Valor: Σ `saldoPotencial` no recorte (`fmtBRL(v, true)`).
2. Linha: `{n} projetos · sem compromisso há 6+ meses`.
3. Top 3 projetos (nome truncado + valor), sem aprovador e sem barra.
4. Link `Ver detalhe →` para `/risco-caixa`.

A nota de premissa (legado), a barra e o texto longo **saem** do verso. Continuam disponíveis na tela de detalhe. Estados `loading`, `unavailable` e `reconciliation.ok = false` seguem o `SaldoPotencialCard` atual: verso neutro com uma linha de explicação.

**Card "Fluxo de Caixa", verso "Composição por Plataforma":**
- Uma linha por plataforma (`n4Curta`), ordenada por BG desc.
- Barra horizontal 100% do BG da plataforma: **Caixa** (realizado + em pagamento, sólido) | **Compromisso** (tracejado/hachura) | **Saldo** (vazio). Se caixa + compromisso > BG, a barra passa de 100% e o excesso aparece em vermelho, com o rótulo "+R$ X acima".
- À direita: BG (R$ M) e % de caixa.
- Clique na linha aplica o filtro de Programa (mesmo handler do filtro existente).
- Mesma fonte dos cartões (`listaAno`, já filtrada por rubrica). Nenhum dado novo.

### 2.3 Explicação Compromisso 26 / 27 (tooltip ⓘ nos dois cartões)

Texto fixo + decomposição calculada (função pura `explicarCompromissoExercicio`, fase E6):

> **Como classificamos:** cada RC recebe uma data estimada de pagamento pela etapa da esteira (RC/OC em aprovação: hoje + 71 dias; aguardando entrega: data prometida + 49 dias; recebido: hoje + 49; NF lançada: hoje + 39). Pagamento até 31/12 = 2026; depois = 2027. A decisão do gestor na Curadoria prevalece sobre a sugestão.

| Linha da decomposição (Compromisso 27) | Fonte |
|---|---|
| Data estimada após 31/12 | `classification = CAIXA_27`, sem decisão do gestor, `suggestedPaymentDate > limite` |
| Sem data prevista | `classification = CAIXA_27` e `suggestedPaymentDate == null` (E0, residual, etapa desconhecida) |
| Decisão do gestor | `isClassificationConfirmed` / decisão com `cashYear > exercício` |

Para o Compromisso 26: "Data estimada até 31/12" e "Decisão do gestor", com o "Em risco" separado em linha própria quando ele estiver contido no 26. **Confirmar na F0** se o cartão Compromisso 26 inclui ou exclui o Em risco.

### 2.4 Tabela da Classificação Risco Empenho

- Wrapper: `overflow: auto` nos dois eixos, `max-height: calc(100dvh - <offset do topo medido>)`. A barra horizontal fica no rodapé **visível** do container, sem precisar rolar a página até o fim da grade.
- `thead th { position: sticky; top: 0; z-index: 2 }`, com fundo sólido do tema (sem transparência).
- 1ª coluna (RC) `position: sticky; left: 0; z-index: 1`. O canto superior esquerdo fica com `z-index: 3`.
- Sombra sutil na borda da coluna e do cabeçalho fixos, só quando houver rolagem (classe aplicada por `onScroll`).
- Telas ≤ 1366 px: densidade compacta (padding vertical menor). Colunas de texto longo (Projeto · Fornecedor, Próxima ação) com `max-width` + `truncate` + `title`.
- Nenhuma lib nova. Se a página tiver rolagem própria, a tabela não pode criar uma terceira barra vertical. Verificar na F0.

### 2.5 Curadoria por natureza do item

| Natureza | Código do item começa por | Marco da curadoria | Campo do gestor |
|---|---|---|---|
| Patrimonial | A, M | **Recebimento do item** | "Recebimento previsto" (data). Pagamento sugerido = recebimento + 49 dias (`paymentFromDelivery`) |
| Serviço / despesa | E, S, L | Pagamento, que pode ser parcelado | "Pagamento previsto" (data) + **rateio 2026/2027** |
| Não identificada | sem código ou outro prefixo | como hoje | como hoje |

**Rateio (`pctCaixaExercicio`, 0–100, inteiro):**
- Atalhos: `100% em 2026` · `75/25` · `50/50` · `25/75` · `100% em 2027`, mais "outro" (input numérico de 5 em 5). 2027 = 100 − 2026, exibido e nunca digitado.
- `null` = sem rateio: o valor inteiro vai para o ano da classificação (comportamento atual).
- Efeito: Compromisso 26 += valor × pct; Compromisso 27 += valor × (100 − pct). Fica atrás da flag `VITE_RATEIO_EXERCICIO` até validar.
- A classificação da RC (Caixa 26 / Em risco / Caixa 27) continua uma só. O rateio só reparte o **valor** entre os cartões.
- Na tabela: chip `60/40` ao lado da classificação quando houver rateio.
- Regra de grão: o rateio é por **RC** (mesmo grão da decisão do gestor). RC com itens de naturezas diferentes = natureza **"Mista"**: mostra os dois campos, e o rateio vale para a parcela de serviço. Validar com o negócio (decisão N4).

---

## 3. Análise da regra Compromisso 2026 × 2027 (resposta ao item 3 do pedido)

**Qual regra decide:** a **data estimada de pagamento** (`suggestPaymentDate`, `decision.ts`) comparada com 31/12 do exercício (`suggestClassification`, `operational.ts`). Dentro do ano, a etapa decide entre Caixa 26 e Em risco (E1–E3 ou E4 atrasado = Em risco). A decisão do gestor prevalece (`classificationFromDecision`).

| Pergunta | Resposta |
|---|---|
| Considera empenho? | **Indiretamente.** A etapa (RC/OC aprovada ou não) só define qual prazo padrão somar. O valor empenhado não entra na regra. |
| Considera entrega? | **Sim, só na E4:** usa a `DATA_PROMETIDA` (ou hoje, se ela já passou) + 10 dias até a NF + 39 dias até o pagamento. |
| Considera pagamento? | **Sim:** é o critério final (estimado). O pagamento real só aparece quando a NF vai para pagamento (E7). |
| Pagamento parcelado? | **Não.** O valor inteiro da RC vai para um único ano. É isso que o rateio (2.5) resolve. |

**Ambiguidades encontradas**

| # | Caso | Efeito hoje | Proposta |
|---|---|---|---|
| A1 | **Virada automática das RCs em E1–E3:** data = hoje + 71 dias. A partir de **22/10/2026** (22/10 + 71 = 01/01/2027), toda RC em aprovação ou cotação passa sozinha para Compromisso 27, sem nenhum dado mudar. | Salto no cartão 27 a partir de quinta-feira. A diretoria pode ler como piora real. | Decisão N2. Até lá, a decomposição (2.3) mostra o salto como "data estimada após 31/12". |
| A2 | **Sem data prevista vai para 27** (E0, residual, etapa desconhecida). | Valor sem informação é tratado como carryover. | Linha "sem data prevista" separada na decomposição (E6). Decisão N3: virar uma categoria própria. |
| A3 | **Classificação muda com o relógio:** `stageConfig.referenceDate = new Date()`. | O mesmo bundle dá números diferentes em dias diferentes. | Exibir "estimativa de dd/mm" no tooltip. A referência fixa na data do BI fica para depois. |
| A4 | **`paymentMode = MEDICAO_MENSAL`** já existe na decisão, mas não reparte valor. | Serviço mensal fica 100% num ano. | Resolvido pelo rateio (C3). |

---

## 4. Fases e gates

| Fase | Prompt | Entrega | Gate |
|---|---|---|---|
| **F · Investigação** | F0 | Mapa de arquivos e respostas (modo Ask) | relatório |
| **E · Executiva** | E1 | `labels.ts` + renomeações | `tsc`, textos na tela |
| | E2 | `FlipCard` | `tsc`, `npm test` |
| | E3 | Em risco ↔ Auditoria de Saldos; faixa removida; Fluxo em largura total | validação visual V1–V3 |
| | E4 | `buildComposicaoPlataforma` + verso do Fluxo | vitest + V4 |
| | E5 | Rubrica sem "Não Informada" | vitest de invariância |
| | E6 | `explicarCompromissoExercicio` + tooltip | vitest + V5 |
| **T · Tabela** | T1 | Cabeçalho e 1ª coluna fixos, rolagem horizontal visível | V6 |
| **C · Curadoria** | C1 | Natureza do item no bundle (**depende de N5**) | baseline + vitest |
| | C2 | Campo `pctCaixaExercicio` (tipos, API, persistência) | vitest + chamada à API |
| | C3 | UI da curadoria por natureza + rateio nos cartões (flag) | flag off = idêntico; V7 |

**Sequência:** F0 → E1 → E2 → E3 → E4 → E5 → E6 → T1 → (validar) → C2 → C3 → C1 (quando N5 chegar).
C2 e C3 funcionam sem C1: sem natureza, os itens ficam "Não identificada" e mostram os dois campos.
Um prompt por conversa. Commit depois de cada gate verde.

---

## 5. Prompts para o GitHub Copilot

### F0 · Investigação (modo **Ask**, somente leitura)

```
#file:PLANO_UX_V3_REVISAO.md
Somente leitura — NÃO edite nenhum arquivo. Responda em tabelas curtas com arquivo:linha e trechos de código.

1. Navegação: onde estão os rótulos "Visão Executiva", "Curadoria", "Classificação Risco Empenho", "Risco de Caixa & Rubricas"
   e "Auditoria"? A tela "Auditoria" (Área Técnica de Validação) ainda é alcançável pela navegação? Por qual caminho?
2. RadarExecutivoPage (aba 2026): linhas dos 6 cartões (BG Gov, Realizado, Em pagamento, Compromisso 26, Compromisso 27, Em risco);
   linha do <SaldoPotencialCard variant="compact">; card do Fluxo de Caixa (componente, props, grid/colunas que ocupa
   e o que fica ao lado dele).
3. Compromisso 26 e 27: função e campo que somam cada cartão. O Compromisso 26 inclui ou exclui as RCs "Em risco"?
   De onde vem isClassificationConfirmed?
4. Rubrica: todas as fontes de opções do filtro (Executiva, Classificação, Curadoria, Risco de Caixa). Onde nasce "NAO_INFORMADA"
   / "Não Informada" (preprocessador? fallback?) e quanto vale Σ orcamento2026/compromisso nessa rubrica no JSON atual.
5. Tabela da Classificação Risco Empenho: componente, wrapper com overflow, quem rola (página ou tabela), colunas e larguras.
6. Curadoria: componente do formulário, tipo RcCurationUpsertRequest, rota da API (pasta api/), onde a curadoria é gravada
   (banco/arquivo/KV) e o esquema/migração. Como adicionar um campo opcional sem quebrar curadorias antigas?
7. Existe hoje, em qualquer CSV, DAX, JSON ou tipo, um código de item / categoria de item (prefixo A, M, E, S, L)?
   Liste os candidatos (coluna, arquivo, exemplo de valor).
8. Plataformas: valores distintos de n4Curta na listaAno e se ProjetoMetricas tem BG, realizado, em pagamento e compromisso por projeto.
Sem propor mudanças.
```

### 5.1 Achados da F0 (19/10/2026) e ajustes no plano

| # | Achado | Ajuste |
|---|---|---|
| 1 | Navegação em `App.tsx` ~189–225. A tela **Auditoria técnica não está no menu**: só se chega por "Ver detalhes →" (Execução do Plano) e "Ver fluxo completo →", via `/auditoria` (App.tsx ~105–110). | Não há dois "Auditoria" no menu, mas o conflito de sentido continua (o link "Ver detalhes" leva a outra "Auditoria"). E1 não mexe na tela técnica. N1 continua aberta. |
| 2 | 6 cartões 2026 em `RadarExecutivoPage.tsx` ~287–310; `SaldoPotencialCard compact` ~337; Fluxo em grid `grid-cols-[1fr_minmax(300px,360px)]` ~355–370, com coluna `w-[150px]` (Realizado/Planejado/Desvio) e `AnaliseRiscoPanel` à direita (~370–420). | E3: o Fluxo vai para a largura total e o `AnaliseRiscoPanel` desce para a linha seguinte (não sai). A coluna de 150px fica dentro do card. |
| 3 | `buildBgVivo` (`executive.ts`:714). **Compromisso 26 = CAIXA_26 + EM_RISCO** (~726–728); Compromisso 27 = CAIXA_27 (~750–753); exclui DESCONHECIDA e RESIDUAL. `isClassificationConfirmed` em `operational.ts` ~282–291. | E6: a decomposição do 26 mostra "Em risco (incluído)" como linha própria. As somas usam o mesmo filtro de `buildBgVivo`. |
| 4 | Fonte única das opções de rubrica: `rubricasDoRecorte` (`src/lib/recorte.ts`:79–88). `NAO_INFORMADA` nasce como fallback em `csvProcessingCore.ts`:103/136/157 e `saldoProjetosCore.ts`:18/97. **Σ = 0** na carteira e ausente do bundle. | E5 vira uma mudança só em `rubricasDoRecorte`, sem a nota "Todas inclui R$ X". |
| 5 | Classificação: `OperationalTable.tsx` com wrapper `overflow-auto max-h-[70vh]` (:593) e `thead` já `sticky top-0` (:596); 1280px. Curadoria: `CommitmentTable.tsx`:74 com `overflow-x-auto` **sem `max-h`** (1514px): a página rola e a barra horizontal só aparece no fim da grade. | T1 cria um wrapper comum (`ScrollTable`) e aplica nas **duas** tabelas. Na Curadoria está o pior caso da barra horizontal. |
| 6 | Curadoria em **PostgreSQL** (`api/_lib/db.ts`), tabela `commitment_curation`, migrações `db/migrations/001–004`, whitelist em `api/_lib/curationColumns.ts`:34/113/260, validação em `api/_lib/validation.ts`:88, `testDb.ts`:39 lista as migrações. **Não há runner de migração no repositório.** | C2: migração `005_rateio_exercicio.sql` (ADD COLUMN NULL) + `testDb.ts` + whitelist + `rowToCuration` + validação + tipos. **Aplicar o SQL manualmente no banco de produção antes do deploy.** |
| 7 | Não existe código de item em nenhum CSV, DAX, JSON ou tipo. | N5 confirmada como bloqueio da C1. |
| 8 | `n4Curta`: Captação e Produção · Metadados e Mídias · Pré-Produção · Pós-Produção e Design. `ProjetoMetricas` (`types/index.ts`:107) tem BG, realizado, em pagamento e compromisso por projeto. | E4 sem dado novo, como previsto. |

### E1 · Rótulos centralizados e renomeações

```
#file:PLANO_UX_V3_REVISAO.md <arquivos de navegação e da RadarExecutivoPage indicados na F0>

Tarefa E1 (seções 0 e 6). Você PRECISA editar.
1. Crie src/config/labels.ts:
   export const LABELS = {
     riscoCaixaNav: "Auditoria",            // decisão N1 pode trocar
     riscoCaixaTitulo: "Auditoria",
     saldoParadoCard: "Auditoria de Saldos", // decisão N1 pode trocar
     auditoriaTecnicaNav: <rótulo atual da tela Auditoria técnica>,
   } as const;
2. Troque os textos literais desses pontos (nav, título da página /risco-caixa, título do SaldoPotencialCard)
   por LABELS.*. A rota /risco-caixa NÃO muda.
3. Se a F0 mostrou que a tela "Auditoria" técnica é alcançável pela navegação, renomeie o rótulo DELA para
   "Validação técnica" em LABELS.auditoriaTecnicaNav, para não haver dois itens "Auditoria" no menu.
Restrições: só textos; nenhuma lógica, rota ou estilo muda.
Aceite: `npx tsc -b` limpo, `npm test` verde, grep sem literais "Risco de Caixa & Rubricas" fora de labels.ts. Pare.
```

### E2 · Componente `FlipCard`

```
#file:PLANO_UX_V3_REVISAO.md #file:src/components/ui/primitives.tsx

Tarefa E2 (seção 2.1). Você PRECISA criar src/components/ui/FlipCard.tsx. Não altere outros arquivos.
- Props exatamente como na seção 2.1.
- Botão no canto superior direito: ícone RefreshCw (lucide) + "Ver {backLabel|frontLabel}", aria-pressed.
- Faces empilhadas na mesma célula de grid (grid-area 1/1); face oculta com aria-hidden e inert.
- Rotação Y 400 ms (transform-style preserve-3d, backface-visibility hidden). Com prefers-reduced-motion: fade 150 ms.
  Use classes Tailwind (motion-safe:/motion-reduce:) e, se preciso, um bloco CSS no arquivo de estilos existente.
- Ao virar, mover o foco para o primeiro heading da face visível.
- Tokens e Card existentes; claro e escuro; sem hex.
Aceite: `npx tsc -b` limpo, `npm test` verde, `git status` só com o arquivo novo (+ CSS se usado). Pare.
```

### E3 · Em risco ↔ Auditoria de Saldos; Fluxo em largura total

```
#file:PLANO_UX_V3_REVISAO.md #file:src/pages/RadarExecutivoPage.tsx #file:src/components/ui/FlipCard.tsx #file:src/features/saldo/SaldoPotencialCard.tsx #file:src/features/saldo/saldo.ts #file:src/config/labels.ts

Tarefa E3 (seção 2.2). Você PRECISA editar.
1. Em SaldoPotencialCard.tsx acrescente variant "flip" (as atuais não mudam): título LABELS.saldoParadoCard,
   valor Σ saldoPotencial, "{n} projetos · sem compromisso há 6+ meses", top 3 (nome truncate + valor) e
   link "Ver detalhe →" (onOpenDetail). Sem barra, sem nota de premissa, sem aprovador. Estados loading/unavailable/
   não reconciliado: uma linha neutra.
2. Em RadarExecutivoPage (aba 2026): envolva o cartão "Em risco" em
   <FlipCard frontLabel="Em risco" backLabel={LABELS.saldoParadoCard} front={<cartão atual>}
             back={<SaldoPotencialCard variant="flip" projectKeys={...mesmo escopo de hoje} />} />.
   O cartão da frente fica idêntico. A altura da linha de cartões não pode crescer.
3. Remova a montagem do <SaldoPotencialCard variant="compact"> da página (o componente continua no repo).
4. O card do Fluxo de Caixa passa a ocupar a largura total da linha (o que estava ao lado desce para a linha seguinte,
   sem ser removido) e a altura do gráfico aumenta ~40%.
5. Aba 2027 sem mudança. Com VITE_FEATURE_SALDO_PROJETOS desligada, o cartão Em risco fica sem flip.
Aceite: `npx tsc -b`, `npm test` verdes; `npm run build` e depois `git checkout -- public/data`. Pare.
```

### E4 · Composição por Plataforma (verso do Fluxo)

```
#file:PLANO_UX_V3_REVISAO.md #file:src/pages/RadarExecutivoPage.tsx #file:src/components/ui/FlipCard.tsx #file:src/lib/format.ts

Tarefa E4 (seção 2.2, verso do Fluxo). Você PRECISA criar e editar.
1. src/features/executivo/composicao.ts (pura):
   export interface ComposicaoPlataforma { plataforma: string; bg: number; caixa: number; compromisso: number;
     saldo: number; excesso: number; pctCaixa: number | null }
   export function buildComposicaoPlataforma(lista: Array<{ n4Curta: string | null; orcamento2026: number|null;
     realizado2026: number|null; emPagamento2026: number|null; compromisso: number|null }>): ComposicaoPlataforma[]
   caixa = realizado + emPagamento; saldo = max(0, bg − caixa − compromisso); excesso = max(0, caixa + compromisso − bg);
   n4Curta nulo → "Sem plataforma"; ordem por bg desc; nulos = 0; pctCaixa null se bg = 0.
2. composicao.test.ts: soma por plataforma = total da lista; excesso só quando passa do BG; ordem; plataforma nula.
3. src/features/executivo/ComposicaoPlataformaChart.tsx: uma linha por plataforma conforme a seção 2.2
   (barra 100% do BG: caixa sólido | compromisso hachurado | saldo vazio; excesso em text-risk-critico com "+R$ X acima";
   à direita BG e % caixa). SVG/divs com Tailwind, sem lib nova; role="img" com aria-label por linha.
   Prop onSelectPlataforma(n4Curta) → mesmo handler do filtro Programa da página.
4. Na RadarExecutivoPage: Fluxo vira <FlipCard frontLabel="Fluxo de caixa" backLabel="Composição por plataforma" …/>
   com a mesma lista que alimenta os cartões (já filtrada).
Aceite: `npx vitest run src/features/executivo` verde, `npx tsc -b` limpo. Pare.
```

### E5 · Rubrica sem "Não Informada"

```
#file:PLANO_UX_V3_REVISAO.md #file:src/lib/rubrica.ts <fontes de opções de rubrica listadas na F0>

Tarefa E5. Você PRECISA editar.
1. Em src/lib/rubrica.ts acrescente:
   export const RUBRICAS_OCULTAS = new Set(["NAO_INFORMADA", "Não Informada", "NÃO INFORMADA"]);
   export function opcoesRubricaVisiveis(rubricas: string[]): string[]  // remove as ocultas (comparação normalizada)
2. Aplique opcoesRubricaVisiveis em TODAS as fontes de opções de rubrica da F0 (Executiva, Classificação, Curadoria, Risco de Caixa).
   NÃO altere aplicarFiltroRubrica nem rubricasDisponiveis.
3. Testes em rubrica.test.ts (acrescentar, sem editar os existentes):
   - opcoesRubricaVisiveis remove as três grafias e mantém a ordem.
   - Invariância: aplicarFiltroRubrica(lista, []) === lista (nenhuma rubrica = sem filtro, inclui Não Informada).
   - Lista com valor em NAO_INFORMADA: a soma de "todas as rubricas visíveis selecionadas" difere de "Todas" exatamente
     pelo valor de NAO_INFORMADA (documenta o efeito; o teste passa).
4. Se a F0 mostrou valor ≠ 0 em Não Informada: acrescente ao lado do filtro um texto muted
   "Todas inclui R$ X sem rubrica" (só quando X ≥ R$ 1 mil).
Aceite: `npm test` verde, `npx tsc -b` limpo. Pare.
```

### E6 · Explicação Compromisso 26 / 27

```
#file:PLANO_UX_V3_REVISAO.md #file:src/features/radar/operational.ts #file:src/features/radar/decision.ts #file:src/features/radar/stageConfig.ts #file:src/pages/RadarExecutivoPage.tsx

Tarefa E6 (seções 2.3 e 3). Você PRECISA criar e editar. NÃO altere operational.ts, decision.ts nem stageConfig.ts.
1. src/features/executivo/compromissoExplicacao.ts (pura):
   export interface ExplicacaoCompromisso { ano: 26 | 27; total: number; linhas: Array<{ rotulo: string; valor: number; qtd: number }>;
     referencia: string }  // dd/mm da estimativa
   export function explicarCompromissoExercicio(rows: OperationalRow[], exerciseYear: number, referencia: string): {
     c26: ExplicacaoCompromisso; c27: ExplicacaoCompromisso }
   Linhas do 27: "Data estimada após 31/12" | "Sem data prevista" | "Decisão do gestor" (seção 2.3).
   Linhas do 26: "Data estimada até 31/12" | "Decisão do gestor" (+ "Em risco" conforme a resposta 3 da F0).
   Use o MESMO valor e o MESMO filtro que os cartões usam hoje (F0, item 3): Σ linhas = valor do cartão.
2. compromissoExplicacao.test.ts: Σ linhas = total; RC sem suggestedPaymentDate → "Sem data prevista";
   decisão do gestor tem precedência; linhas com valor 0 omitidas.
3. Nos cartões Compromisso 26 e 27: ícone ⓘ (InfoTooltip existente) com o texto fixo "Como classificamos" da seção 2.3,
   a decomposição (rótulo · R$ · qtd de RCs) e "Estimativa de {referencia}". O valor do cartão não muda.
Aceite: vitest verde, `npx tsc -b` limpo, número dos cartões idêntico ao anterior. Pare.
```

### T1 · Tabela da Classificação

```
#file:PLANO_UX_V3_REVISAO.md <componente da tabela da Classificação indicado na F0>

Tarefa T1 (seção 2.4). Você PRECISA editar só o componente da tabela (e o CSS global, se necessário).
1. Wrapper da tabela: overflow-auto nos dois eixos, max-height calc(100dvh - var(--tabela-offset)), com --tabela-offset
   medido por ResizeObserver a partir do topo do wrapper (fallback 220px). A página não deve ter barra horizontal.
2. thead th: sticky top-0, z-20, fundo sólido do tema (bg-surface ou o token usado no card), borda inferior.
3. Primeira coluna (RC) em th e td: sticky left-0, z-10, mesmo fundo da linha (inclusive hover e selecionada); canto z-30.
4. Sombra nas bordas fixas só quando scrollTop > 0 / scrollLeft > 0 (state por onScroll, com throttle via requestAnimationFrame).
5. Até 1366 px de largura: py menor nas células; colunas "Projeto · Fornecedor" e "Próxima ação" com max-w + truncate + title.
6. Teclado: o wrapper recebe tabIndex=0 e aria-label "Tabela de RCs, role para ver mais colunas".
Nenhuma lib nova. Nenhuma coluna, ordenação ou dado muda.
Aceite: `npx tsc -b`, `npm test` verdes; a validação V6 (seção 7) é visual, feita por você. Pare.
```

### C2 · Campo de rateio na curadoria (tipos, API, persistência)

```
#file:PLANO_UX_V3_REVISAO.md <tipos, API e camada de persistência da curadoria indicados na F0>

Tarefa C2 (seção 2.5). Você PRECISA editar. Mudança aditiva e opcional.
1. Acrescente pctCaixaExercicio?: number | null (inteiro 0–100) e naturezaInformada?: "PATRIMONIAL" | "SERVICO" | null
   ao tipo de curadoria (RcCurationUpsertRequest e ao tipo lido), à validação da API e à persistência,
   seguindo o padrão dos campos opcionais existentes (ex.: nextAction). Migração, se houver esquema, só com ADD COLUMN nullable.
2. Validação na API: inteiro, 0 ≤ x ≤ 100, ou null. Fora disso → 400 com mensagem em português.
3. readDecision devolve pctCaixaExercicio (null quando ausente). Curadorias antigas → null.
4. buildClassificationPayload aceita options.pctCaixaExercicio e repassa. NAO_OCORRE → força null.
5. Testes: validação (−1, 101, 50.5 → erro; 0, 100, null → ok); readDecision de curadoria antiga → null;
   payload NAO_OCORRE zera o rateio. Não edite testes existentes.
Aceite: `npm test` verde, `npx tsc -b` limpo, curadoria antiga abre sem erro em `npm run dev`. Pare.
```

### C3 · Curadoria por natureza + rateio nos cartões (flag)

```
#file:PLANO_UX_V3_REVISAO.md <formulário da curadoria, tabela da Classificação, cálculo dos cartões Compromisso 26/27 (F0)>

Tarefa C3 (seção 2.5). Você PRECISA editar.
1. src/features/radar/natureza.ts (pura):
   export type NaturezaItem = "PATRIMONIAL" | "SERVICO" | "MISTA" | "NAO_IDENTIFICADA";
   export function naturezaDoCodigo(codigo: string | null): "PATRIMONIAL" | "SERVICO" | "NAO_IDENTIFICADA"
     // trim + maiúscula; A|M → PATRIMONIAL; E|S|L → SERVICO; demais/vazio → NAO_IDENTIFICADA
   export function naturezaDaRc(codigos: Array<string | null>): NaturezaItem   // todas iguais → ela; mistura P+S → MISTA
   export function repartirValor(valor: number, pct: number | null, classificacao: "CAIXA_26"|"EM_RISCO"|"CAIXA_27"|"NAO_OCORRE"):
     { v26: number; v27: number }  // pct null → tudo no ano da classificação; NAO_OCORRE → 0/0; soma = valor (centavos)
   Testes para as três funções, incluindo arredondamento (v26 + v27 === valor).
2. Formulário da curadoria, por natureza (enquanto C1 não existir, use NAO_IDENTIFICADA → mostra os dois blocos):
   - PATRIMONIAL: rótulo "Recebimento previsto" no campo de data de entrega (mesmo campo, só o rótulo muda).
   - SERVICO / MISTA / NAO_IDENTIFICADA: bloco "Pagamento entre exercícios" com atalhos 100% 2026 · 75/25 · 50/50 · 25/75 ·
     100% 2027 e "outro" (input step 5). Mostra "2027: {100 − x}%" calculado. Botão limpar → null.
   - Só aparece com import.meta.env.VITE_RATEIO_EXERCICIO === "true".
3. Tabela da Classificação: chip "{x}/{100−x}" ao lado da classificação quando pctCaixaExercicio != null (com a flag).
4. Cartões Compromisso 26/27: com a flag ligada, some via repartirValor; com a flag desligada, cálculo atual intacto.
   A decomposição do E6 ganha a linha "Rateio entre exercícios" quando houver.
5. vite-env.d.ts: VITE_RATEIO_EXERCICIO?: string.
Aceite: flag off → cartões, tabela e formulário idênticos; flag on → Σ (Comp 26 + Comp 27) igual ao da flag off
(o rateio só move valor); `npm test` e `npx tsc -b` verdes. Pare.
```

### C1 · Natureza do item no bundle (aguarda N5)

```
#file:PLANO_UX_V3_REVISAO.md #file:public/data/compromissos_detalhados.dax #file:scripts/preprocessCsv.mjs #file:src/features/radar/types.ts #file:src/features/radar/natureza.ts

Tarefa C1. Pré-requisito: a coluna <TABELA[COLUNA]> do BI (decisão N5) já foi adicionada ao DAX e o CSV foi reextraído.
1. compromissos_detalhados.dax: acrescente a coluna como "CODIGO_ITEM" no fim do SELECTCOLUMNS (nenhuma outra muda).
2. Linha de compromisso no bundle: campo opcional itemCode: string | null (append-only em types.ts). CSV sem a coluna → null, sem erro.
3. RC: natureza = naturezaDaRc(itemCodes das linhas). Exponha em OperationalRow.natureza (opcional).
4. O formulário da C3 passa a usar a natureza real.
Aceite: carteira-processed.json idêntico ao baseline; radar-bundle.json só com o campo novo; `npm test` verde. Pare.
```

---

## 6. Decisões pendentes (Gabriel)

| # | Decisão | Recomendação |
|---|---|---|
| N1 | Nome da aba "Risco de Caixa & Rubricas" e do verso do card | **Aba: "Saldo dos Projetos"** (diz o conteúdo: orçamento × caixa × compromisso por projeto e rubrica). **Verso: "Saldo parado"** (a mesma palavra que a diretoria usa). "Auditoria" sugere conferência de dados, colide com a tela técnica e afasta o executivo, que é quem deveria clicar ali. Alternativas: "Orçamento × Comprometido", "Saldos e Estouros". |
| N2 | Virada automática de E1–E3 para 2027 em 22/10 | Para RC em E1–E3, usar `max(hoje, DATA_NECESSIDADE) + 71`. Em novembro e dezembro, classificar como **Em risco** em vez de 27 até o gestor decidir. Mexe em `suggestPaymentDate`; plano à parte. |
| N3 | RC sem data prevista conta como 27 | Criar a categoria "Sem previsão" fora dos dois cartões, como já prevê o `RADAR_V1` (Não avaliado). |
| N4 | Rateio por RC ou por linha/OC | **Por RC** na v1 (mesmo grão da decisão do gestor). Por linha só se houver RC mista relevante. |
| N5 | Coluna do código do item no BI | Nome exato da tabela/coluna no modelo (ex.: código do item da linha da RC). Sem ela, C1 não começa. |

---

## 7. Validação visual (aceite de produto, 1366×768 e 1920×1080)

| # | Critério |
|---|---|
| V1 | Linha de cartões com a mesma altura de antes; "Em risco" vira com clique e com Enter/Espaço; o foco vai para a face nova |
| V2 | Verso do Em risco: valor = R$ 3,1M / 16 projetos sem filtro (igual à faixa removida); no máximo 4 elementos |
| V3 | Fluxo de Caixa ocupa a linha inteira e aparece sem rolar em 1366×768 |
| V4 | Composição: soma dos BGs das plataformas = BG Gov dos cartões; clique filtra o Programa |
| V5 | Tooltip do Compromisso 27: Σ linhas = valor do cartão; "Sem data prevista" aparece quando houver |
| V6 | Classificação: cabeçalho e coluna RC visíveis ao rolar nos dois eixos; barra horizontal sempre visível; sem barra horizontal na página |
| V7 | Rateio 50/50 numa RC de R$ 1M → Comp 26 −R$ 0,5M e Comp 27 +R$ 0,5M; soma igual |
| V8 | Com `prefers-reduced-motion` ativo, o flip é fade |

---

## 8. Visão Diretoria (20/10/2026)

Nova aba, mais enxuta que a Visão Executiva (que continua como está). Decisões do Gabriel:

| # | Decisão |
|---|---|
| VD1 | Nome **"Visão Diretoria"**, rota `/diretoria`. |
| VD2 | Topo: faixa de 3 números (BG 26 · Caixa = realizado + em pagamento, com % · Em risco) e "ver todos ▾", que expande os 6 cartões atuais. |
| VD3 | Execução do Plano por **torres**: abre só a torre 2026 (Realizado + Em pagamento + Compromisso 26, com Em risco destacado dentro do Comp. 26, e folga/excesso vs BG 26). O botão "+ 2027" adiciona a torre 2027 (Compromisso 27, alinhado com os times pelo cadastro, vs BG 27 e saldo a contratar). |
| VD4 | Nota de conciliação: emitido total − Comp. 26 − Comp. 27 (RCs sem classificação ou residuais) aparece quando ≥ `LIMIAR_MATERIALIDADE`. Em 20/10: R$ 61,9M − 48,2 − 9,5 = R$ 4,2M. |
| VD5 | Abaixo: Fluxo de caixa (verso: Composição por plataforma) à esquerda; Top 3 pontos de atenção + Ritmo (só status geral) à direita. |

Números de 20/10 (base 04:34): BG 26 R$ 145,2M · Realizado R$ 80,1M · Em pgto R$ 10,4M · Comp. 26 R$ 48,2M (R$ 28M em risco) · torre 2026 = 95,5% do BG, folga R$ 6,5M · BG 27 R$ 73,9M · Comp. 27 R$ 9,5M (12,9%).

Etapas: D1 (extração sem mudança de comportamento) → D2 (torres: lógica + componente) → D3 (página, rota, menu).
