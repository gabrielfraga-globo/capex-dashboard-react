# Plano de Implementação — Simplificação UX (Visão Executiva v2 + Risco de Caixa v2)

> **Projeto:** `capex-dashboard-react` · branch `feat/saldo-projetos` (ou `feat/ux-v2` a partir dela)
> **Base:** `UX_REVISAO_TELAS_EXECUTIVAS.md` (crítica e wireframes) · `SALDO_PROJETOS_IMPLEMENTACAO.md` (dados)
> **Data:** 18/10/2026 · arquiteto: Claude · implementação: GitHub Copilot (modo Agent)

Coloque este arquivo na raiz do repositório e referencie-o com `#file:PLANO_UX_V2_IMPLEMENTACAO.md`.

---

## 0. Decisões de negócio (18/10/2026)

| # | Decisão | Consequência técnica |
|---|---|---|
| D1 | **Comprometido oficial = Compromisso total** (`Compromisso_Conecta`, R$ 62,6M; é o "Emitido" da Execução do Plano) | O KPI "Comprometido" = Caixa + Compromisso total = R$ 151,6M = **104,4% do BG Gov**, ou seja, **R$ 6,5M acima**. A **Pressão** do Risco de Caixa usa o compromisso total, por projeto |
| D2 | **Orçamento de referência = BG Gov** (BGQ3) | BG Vivo sai da primeira camada e vai para tooltip |
| D3 | **"Em risco" (curadoria do Radar) entra na lista de atenção** | Nova fonte em `buildAttentionList` |

### Como D1 convive com a regra do BI (premissa do legado)

O **saldo potencial / folga parada continua sendo o do BI** (`Valor Saldo`, calculado com compromisso válido): é o número oficial do visual "Saldo Projetos". A ligação entre as duas bases passa a ser explícita **em todo lugar**:

```
Saldo BI (compromisso válido)          −R$ 4,46M
− Compromisso legado (premissa)         R$ 2,01M
= Saldo com compromisso total          −R$ 6,48M   ← "R$ 6,5M acima do orçamento" (KPI oficial)
```

- KPI Comprometido: **"R$ 6,5M acima"**, com a sublinha "R$ 4,5M desconsiderando o legado (premissa)".
- Ponte do Risco de Caixa: ganha as duas linhas acima.
- Os números batem por construção: −4,46 − 2,01 = −6,48.

---

## 1. Invariantes (o que NÃO pode mudar)

| Item | Regra |
|---|---|
| Pipeline, `process-data`, JSONs | Nenhuma mudança. Não há dado novo neste plano |
| `RadarExecutivoPage` com `VITE_HOME_V2` **desligada** | Renderização idêntica à atual |
| Lógica existente (`executive.ts`, `metrics.ts`, `insights.ts`, radar) | Só **import**; nenhuma linha alterada |
| `saldo.ts` / componentes `src/features/saldo/*` | Podem mudar (código nosso, ainda não publicado), sempre com testes |
| `npm test` | Os testes atuais continuam verdes. Um teste existente só pode mudar se a regra que ele cobre mudar, e o prompt diz qual |
| `public/data/*` | Nunca commitar os JSONs regenerados pelo build (`git checkout -- public/data` depois de `npm run build`) |

---

## 2. Arquitetura

### 2.1 Camadas

```
            ┌──────────────── dados (já existem) ────────────────┐
            │ lista: ProjetoMetricas[] (carteira, filtrada)       │
            │ section: SaldoProjetosSection (BI saldo)            │
            │ opRows / risco do Radar (Em risco)                  │
            └───────────────┬─────────────────────────────────────┘
                            │  adaptadores (nas páginas, finos)
            ┌───────────────▼─────────────────────────────────────┐
            │ funções puras (testadas)                             │
            │  saldo.ts       → splitPressaoFolga, bridge c/ legado│
            │  executivo/     → buildAttentionList                 │
            │                   buildNarrativaExecutiva / Risco    │
            │                   buildKpisExecutivos                │
            └───────────────┬─────────────────────────────────────┘
                            │
            ┌───────────────▼─────────────────────────────────────┐
            │ componentes de apresentação (sem regra de negócio)   │
            │  NarrativaBanner · KpiTriplet · AttentionList        │
            │  RiscoKpis · RubricaChips · OndeAgirList · Collapsible│
            └─────────────────────────────────────────────────────┘
```

**Regra:** componentes não calculam nada além de formatação. Toda conta passa por função pura com teste.

### 2.2 Arquivos

```
src/features/executivo/                     (NOVO)
├── types.ts                AttentionKind, AttentionItem, AttentionSource, KpisExecutivos
├── config.ts               ATTENTION_LIMIT, ATTENTION_QUOTAS, ATTENTION_ROUTES
├── attention.ts            buildAttentionList
├── attention.test.ts
├── narrativa.ts            buildNarrativaExecutiva, buildNarrativaRisco
├── narrativa.test.ts
├── kpis.ts                 buildKpisExecutivos
├── kpis.test.ts
├── NarrativaBanner.tsx
├── KpiTriplet.tsx
├── AttentionList.tsx
├── Collapsible.tsx         seção recolhível acessível (botão + aria-expanded)
└── ExecutivoV2Body.tsx     corpo da Visão Executiva v2

src/features/saldo/                         (ALTERAÇÕES)
├── saldo.ts                + saldoTotalDe, splitPressaoFolga, buildSaldoBridge(t, { incluirLegado })
├── saldo.test.ts           + testes novos
├── RiscoKpis.tsx           (NOVO)
├── RubricaChips.tsx        (NOVO)
├── OndeAgirList.tsx        (NOVO)
├── RiscoCaixaPage.tsx      reorganizada (v2)
└── SaldoBridge.tsx         + linhas do legado

src/pages/RadarExecutivoPage.tsx            1 ramo condicional por flag (VITE_HOME_V2)
src/vite-env.d.ts                           + VITE_HOME_V2
```

### 2.3 Contratos das funções puras

```ts
// ── saldo.ts ───────────────────────────────────────────────
/** Saldo com compromisso TOTAL (D1): orcamento − caixa − compromissoTotal. */
export function saldoTotalDe(t: Pick<SaldoTotals, "orcamento" | "caixa" | "compromissoTotal">): number;

export interface PressaoFolga {
  pressao: number;              // Σ |saldoTotal| dos PROJETOS com saldoTotal < −tol (valor positivo)
  projetosPressao: number;
  maiorRubricaPressao: string | null; // rubrica com o saldoTotal mais negativo
  folgaParada: number;          // Σ saldoPotencial (BI)
  projetosParados: number;
  cobertura: number | null;     // folgaParada / pressao (null se pressao = 0)
}
export function splitPressaoFolga(
  porProjeto: SaldoRecorteView[], porRubrica: SaldoRecorteView[]
): PressaoFolga;

// buildSaldoBridge ganha opção (default mantém o comportamento atual):
export function buildSaldoBridge(t: SaldoTotals, opts?: { incluirLegado?: boolean }): SaldoBridgeStep[];
// com incluirLegado: … "Saldo disponível (BI)" result,
//                    "Compromisso legado (premissa)" minus,
//                    "Saldo com compromisso total" result,
//                    "Saldo potencial (parado 6m+)" sub

// ── executivo/types.ts ─────────────────────────────────────
export type AttentionKind = "ACIMA_ORCAMENTO" | "RCS_EM_RISCO" | "SALDO_PARADO";
export interface AttentionSource {          // entrada normalizada pelos adaptadores
  projectKey: string;
  projectName: string;
  owner: string | null;                     // aprovador/gestor
  value: number;                            // sempre positivo
  mesesSemCompromisso?: number | null;      // só SALDO_PARADO
}
export interface AttentionItem extends AttentionSource {
  kind: AttentionKind;
  detail: string;                           // frase curta (ver attention.ts)
  href: string;                             // rota de destino
}
export interface KpisExecutivos {
  orcamento: number;                        // BG Gov
  caixa: number;                            // realizado + em pagamento
  emPagamento: number;
  pctCaixa: number | null;
  desvioPlano: number | null;               // caixa acumulado − planejado acumulado
  compromissoTotal: number;
  comprometido: number;                     // caixa + compromissoTotal
  pctComprometido: number | null;
  excesso: number;                          // max(0, comprometido − orcamento)
  excessoSemLegado: number | null;          // max(0, −saldoBI) — da seção de saldo, se disponível
  folgaParada: number | null;               // saldoPotencial BI no escopo
  projetosParados: number | null;
}

// ── executivo/attention.ts ─────────────────────────────────
export function buildAttentionList(
  input: { acima: AttentionSource[]; emRisco: AttentionSource[]; parados: AttentionSource[]; exerciseYear: number },
  opts?: { limit?: number; quotas?: Partial<Record<AttentionKind, number>> }
): AttentionItem[];

// ── executivo/narrativa.ts ─────────────────────────────────
export function buildNarrativaExecutiva(k: KpisExecutivos): string;
export function buildNarrativaRisco(p: PressaoFolga): string;

// ── executivo/kpis.ts ──────────────────────────────────────
export function buildKpisExecutivos(input: {
  lista: Array<{ orcamento2026: number | null; realizado2026: number | null; emPagamento2026: number | null; compromisso: number | null }>;
  planejadoAcumulado: number | null;
  saldo?: { saldoDisponivel: number; saldoPotencial: number; projetosComSaldo: number } | null;
}): KpisExecutivos;
```

### 2.4 Regras

**`buildAttentionList`**
1. Ignora `value < SALDO_SIGNAL_TOLERANCE` (antes da deduplicação: um sinal desprezível não esconde um sinal material de outra fonte).
2. Um item por projeto. Se o projeto aparece em mais de uma fonte, vale a de maior prioridade: `ACIMA_ORCAMENTO` > `RCS_EM_RISCO` > `SALDO_PARADO`.
3. Seleção por cotas (padrão `{ ACIMA_ORCAMENTO: 2, RCS_EM_RISCO: 2, SALDO_PARADO: 1 }`, `limit` 5), cada fonte por valor desc. Vagas que sobrarem são preenchidas pelos maiores valores restantes, de qualquer tipo.
4. Ordem final: por prioridade de tipo, depois valor desc.
5. `detail`:
   - ACIMA: `comprometido ${fmt(value)} acima do orçamento`
   - RCS_EM_RISCO: `${fmt(value)} em RCs em risco`
   - SALDO_PARADO: `parado há ${n} meses` (singular "1 mês", "neste mês" para 0) ou `sem compromisso aprovado em ${exerciseYear}`
6. `href`: ACIMA e PARADO → `/risco-caixa`; RCS_EM_RISCO → `/radar`.
7. `fmt` = `fmtBRL(v, true)` de `lib/format`.

**`buildNarrativaExecutiva`** (no máximo 2 frases, números em R$ M)
- Frase 1: `Caixa em {pctCaixa} do orçamento` + (`desvioPlano` ≠ null e |desvio| ≥ R$ 100 mil ? ` e {fmt(|d|)} {à frente|atrás} do plano` : "") + ".".
- Frase 2:
  - `excesso > 0`: `O comprometido passa o orçamento em {fmt(excesso)}` + (`folgaParada > 0` ? `; {fmt(folga)} parados há 6+ meses cobrem {pct(min(1, folga/excesso))} disso` : "") + ".". Com cobertura ≥ 100%: `…parados há 6+ meses cobrem todo o excesso.`
  - `excesso = 0`: `O comprometido está em {pctComprometido} do orçamento` + (`folgaParada > 0` ? ` e há {fmt(folga)} parados para remanejar` : "") + ".".
- Valores nulos: a parte correspondente é omitida (nunca escrever "null" ou "NaN").

**`buildNarrativaRisco`**
- `pressao > 0`: `{fmt(pressao)} comprometidos acima do orçamento em {n} projeto(s)` + (`folgaParada > 0` ? `. {fmt(folga)} parados em {m} projeto(s) cobrem {pct(cobertura)} dessa pressão.` : "."). Com cobertura ≥ 100%: `… cobrem toda essa pressão.` (nunca exibir percentual acima de 100%).
- `pressao = 0`: `Nenhum projeto comprometido acima do orçamento` + (`folga > 0` ? `; {fmt(folga)} parados em {m} projeto(s) podem ser remanejados.` : ".").

**Ajustes pós-validação do B2 (18/10)**
- "Tempo parado" na aba Saldo parado usa `ultimaDataParadaPorProjeto` (maior data só entre as rubricas com `saldoPotencial > 0`), não a data mais recente do projeto inteiro.
- Card PRESSÃO mostra a ponte bruto → líquido: "líquido da carteira: −R$ 6,5M após folgas de outros projetos" (`saldoTotalDe` do recorte). Pressão bruta (R$ 17,8M / 72 projetos) ≠ excesso líquido (R$ 6,5M) por construção.
- Filtros: Programa + "Mais filtros" na mesma linha (desktop).

**Cores**
- Neutro por padrão. `text-risk-critico` só para excesso/pressão > 0 e para itens ACIMA. Âmbar (o token de alerta já usado no projeto) para RCS_EM_RISCO. PARADO fica neutro, com marcador ○.
- Nunca usar verde para "acima de 100%".

---

## 3. Fases e gates

| Fase | Prompt | Entrega | Gate |
|---|---|---|---|
| **A · Lógica** | A1 | `saldo.ts`: `saldoTotalDe`, `splitPressaoFolga`, bridge com legado + testes | `vitest src/features/saldo` |
| | A2 | `executivo/`: types, config, `buildAttentionList` + testes | vitest executivo |
| | A3 | `executivo/`: `buildKpisExecutivos`, narrativas + testes | vitest executivo |
| **B · Risco de Caixa v2** | B1 | `RiscoKpis`, `RubricaChips`, `OndeAgirList`, `Collapsible` | `tsc` |
| | B2 | `RiscoCaixaPage` reorganizada + `SaldoBridge` com legado | validação visual (seção 5) |
| **C · Visão Executiva v2** | C0 | **Investigação somente leitura** da `RadarExecutivoPage` | relatório |
| | C1 | `NarrativaBanner`, `KpiTriplet`, `AttentionList` | `tsc` |
| | C2 | `ExecutivoV2Body` + ramo `VITE_HOME_V2` na página | flag off = idêntica; flag on = validação visual |
| **D · Fechamento** | D1 | Documentação + checklist de publicação | — |

**Sequência:** A1 → A2 → A3 → B1 → B2 → (validar B) → C0 → C1 → C2 → (validar C) → D1.
Um prompt por conversa, em modo **Agent**. Commit depois de cada gate verde.

---

## 4. Prompts para o GitHub Copilot

### A1 · Pressão, folga e ponte com legado

```
#file:PLANO_UX_V2_IMPLEMENTACAO.md #file:src/features/saldo/saldo.ts #file:src/features/saldo/saldo.test.ts #file:src/features/saldo/saldoConfig.ts #file:src/features/radar/types.ts

Tarefa A1 (seções 0, 2.3 e 2.4 do plano). Você PRECISA editar arquivos. Só src/features/saldo/saldo.ts e saldo.test.ts.

1. Acrescente a saldo.ts (exportadas, puras):
   - saldoTotalDe(t) = t.orcamento − t.caixa − t.compromissoTotal.
   - interface PressaoFolga e splitPressaoFolga(porProjeto, porRubrica) conforme a seção 2.3:
     · pressao = Σ (−saldoTotalDe(v)) dos projetos com saldoTotalDe(v) < −SALDO_SIGNAL_TOLERANCE; projetosPressao = contagem.
     · maiorRubricaPressao = key da rubrica com o saldoTotalDe mais negativo (< −tol); senão null.
     · folgaParada = Σ v.saldoPotencial (porProjeto); projetosParados = nº de projetos com saldoPotencial > 0.
     · cobertura = pressao > 0 ? folgaParada / pressao : null.
2. buildSaldoBridge(t, opts?: { incluirLegado?: boolean }):
   - SEM opts: comportamento e rótulos atuais idênticos (não quebre o teste existente).
   - COM incluirLegado: depois do passo "Saldo disponível", troque o rótulo para "Saldo disponível (BI)" e acrescente:
     { "Compromisso legado (premissa)", compromissoLegado, "minus" },
     { "Saldo com compromisso total", saldoTotalDe(t), "result" },
     e mantenha por último { "Saldo potencial (parado 6m+)", saldoPotencial, "sub" }.
3. Testes novos em saldo.test.ts (não altere os existentes):
   - saldoTotalDe = saldoDisponivel − compromissoLegado (identidade, tolerância 0,01).
   - splitPressaoFolga: 3 projetos (saldoTotal −5.000, −500, +10.000) → pressao = 5.000, projetosPressao = 1 (o −500 fica abaixo da tolerância).
   - cobertura null quando pressao = 0; = folga/pressao caso contrário.
   - maiorRubricaPressao escolhe a rubrica mais negativa.
   - bridge com incluirLegado: o último "result" (penúltimo passo) = saldoTotalDe(t); o último passo é "sub".

Aceite: `npx vitest run src/features/saldo` verde, `npx tsc -b` limpo. Pare.
```

### A2 · Lista de atenção

```
#file:PLANO_UX_V2_IMPLEMENTACAO.md #file:src/features/saldo/saldoConfig.ts #file:src/lib/format.ts

Tarefa A2 (seções 2.2, 2.3 e 2.4 — buildAttentionList). Você PRECISA criar arquivos. Não altere nenhum arquivo existente.

Crie em src/features/executivo/:
- types.ts: AttentionKind, AttentionSource, AttentionItem, KpisExecutivos (exatamente como na seção 2.3).
- config.ts: ATTENTION_LIMIT = 5; ATTENTION_QUOTAS = { ACIMA_ORCAMENTO: 2, RCS_EM_RISCO: 2, SALDO_PARADO: 1 };
  ATTENTION_PRIORITY = ["ACIMA_ORCAMENTO","RCS_EM_RISCO","SALDO_PARADO"];
  ATTENTION_ROUTES = { ACIMA_ORCAMENTO: "/risco-caixa", RCS_EM_RISCO: "/radar", SALDO_PARADO: "/risco-caixa" }.
- attention.ts: buildAttentionList(input, opts) seguindo EXATAMENTE as regras 1–7 da seção 2.4.
  Use SALDO_SIGNAL_TOLERANCE de ../saldo/saldoConfig e fmtBRL de ../../lib/format. Função pura.
- attention.test.ts (vitest):
  1. dedup: projeto em ACIMA e PARADO aparece uma vez, como ACIMA.
  2. cotas: 5 ACIMA + 5 EM_RISCO + 5 PARADO → 2 + 2 + 1, na ordem de prioridade.
  3. backfill: 0 EM_RISCO, 5 ACIMA, 5 PARADO → as 2 vagas de EM_RISCO vão para os maiores restantes.
  4. ignora value < tolerância.
  5. detail do PARADO: 1 → "parado há 1 mês"; 0 → "parado neste mês"; null → "sem compromisso aprovado em 2026".
  6. href por tipo.

Aceite: `npx vitest run src/features/executivo` verde, `npx tsc -b` limpo, `git status` só com arquivos novos. Pare.
```

### A3 · KPIs e narrativas

```
#file:PLANO_UX_V2_IMPLEMENTACAO.md #file:src/features/executivo/types.ts #file:src/features/saldo/saldo.ts #file:src/lib/format.ts

Tarefa A3 (seções 2.3 e 2.4). Você PRECISA criar arquivos. Não altere arquivos existentes.

Crie em src/features/executivo/:
- kpis.ts: buildKpisExecutivos(input) conforme a seção 2.3:
  orcamento = Σ orcamento2026; caixa = Σ (realizado2026 + emPagamento2026); emPagamento = Σ emPagamento2026;
  compromissoTotal = Σ compromisso; comprometido = caixa + compromissoTotal; excesso = max(0, comprometido − orcamento);
  pctCaixa/pctComprometido = null se orcamento = 0; desvioPlano = planejadoAcumulado == null ? null : caixa − planejadoAcumulado;
  excessoSemLegado = saldo ? max(0, −saldo.saldoDisponivel) : null; folgaParada/projetosParados do saldo (ou null). Nulos contam como 0.
- narrativa.ts: buildNarrativaExecutiva(k) e buildNarrativaRisco(p: PressaoFolga) seguindo EXATAMENTE os textos da seção 2.4.
  Percentuais com fmtPct; valores com fmtBRL(v, true). Plural de projeto(s).
- kpis.test.ts e narrativa.test.ts (vitest), cobrindo:
  · Caso real: orcamento 145.150.601, caixa 88.997.307, compromissoTotal 62.630.086, saldoDisponivel −4.461.848,
    saldoPotencial 3.114.976 → excesso ≈ 6.476.792; excessoSemLegado ≈ 4.461.848.
  · Narrativa com excesso e folga (cobertura parcial), com cobertura ≥ 100% ("cobrem todo o excesso") e sem excesso.
  · desvioPlano null → a frase 1 não menciona o plano. |desvio| < 100 mil → também não.
  · buildNarrativaRisco com pressao = 0 e com pressao > 0; singular "1 projeto".
  · Nenhuma saída contém "null", "NaN" ou "undefined".

Aceite: `npx vitest run src/features/executivo` verde, `npx tsc -b` limpo. Pare.
```

### B1 · Componentes do Risco de Caixa v2

```
#file:PLANO_UX_V2_IMPLEMENTACAO.md #file:UX_REVISAO_TELAS_EXECUTIVAS.md #file:src/features/saldo/saldo.ts #file:src/features/executivo/narrativa.ts #file:src/components/ui/primitives.tsx #file:src/lib/format.ts

Tarefa B1: criar componentes de apresentação (sem regra de negócio, só formatação). Você PRECISA criar arquivos.
Tokens/primitivas existentes; tema claro e escuro; nenhuma cor hex; valores com fmtBRL(v, true) e tooltip com o valor exato (fmtBRL(v)).

1. src/features/executivo/Collapsible.tsx — props { title: string; defaultOpen?: boolean; children }.
   Botão com aria-expanded e ícone ChevronRight/Down (lucide); conteúdo montado só quando aberto.
2. src/features/saldo/RiscoKpis.tsx — props { pf: PressaoFolga }.
   Dois cards lado a lado (1 coluna no mobile):
   · PRESSÃO: fmt(pressao) "acima do orçamento", em text-risk-critico se > 0; sublinha "{n} projeto(s) · maior: {rubrica}".
     Se pressao = 0: "Nenhum projeto acima do orçamento" (neutro).
   · FOLGA PARADA: fmt(folgaParada) "remanejável"; sublinha "{m} projeto(s) · sem compromisso há 6+ meses". Neutro.
3. src/features/saldo/RubricaChips.tsx — props { views: SaldoRecorteView[]; selected: string[]; onToggle(r): void }.
   Uma linha (flex-wrap) de chips <button aria-pressed>: "{RUBRICA} {fmt(saldoTotalDe(v))}" com sinal;
   texto em text-risk-critico se negativo. Selecionado com borda de destaque. Ordem: mais negativo primeiro.
4. src/features/saldo/OndeAgirList.tsx — props { porProjeto: SaldoRecorteView[]; meta: Map<string,{ n4Curta: string }>;
   dataReferencia: string; exerciseYear: number; limit?: number (default 10); onVerTodos?: () => void }.
   Duas abas (botões role="tab"/aria-selected): "Acima do orçamento (N)" e "Saldo parado (M)".
   · Acima: projetos com saldoTotalDe < −tol, ordem pelo mais negativo. Colunas: Projeto (+ programa em linha menor) |
     Responsável | Valor (−fmt) | Situação ("comprometido {pct} do orçamento").
   · Parado: saldoPotencial > 0, ordem desc. Colunas: Projeto | Responsável | Valor | "parado há N meses"/"sem compromisso aprovado em {ano}".
   · Sem resultados: texto neutro. Rodapé: link "Ver todos os projetos →" (onVerTodos) se houver mais que o limit.
   Aba inicial: "Acima" se houver itens, senão "Parado".

Não altere arquivos existentes. Aceite: `npx tsc -b` limpo, `npm test` verde, `git status` só com arquivos novos. Pare.
```

### B2 · Página Risco de Caixa v2

```
#file:PLANO_UX_V2_IMPLEMENTACAO.md #file:UX_REVISAO_TELAS_EXECUTIVAS.md #file:src/features/saldo/RiscoCaixaPage.tsx #file:src/features/saldo/SaldoBridge.tsx #file:src/features/saldo/RiscoKpis.tsx #file:src/features/saldo/RubricaChips.tsx #file:src/features/saldo/OndeAgirList.tsx #file:src/features/executivo/Collapsible.tsx #file:src/features/executivo/narrativa.ts

Tarefa B2: reorganizar RiscoCaixaPage conforme o wireframe da seção 4 de UX_REVISAO_TELAS_EXECUTIVAS.md. Você PRECISA editar.
Não altere os cálculos de saldo.ts; use splitPressaoFolga, aggregateSaldoBy e buildNarrativaRisco.

Ordem dos blocos (de cima para baixo):
1. Header (como está) + filtros NA MESMA FAIXA: Programa visível; Rubrica, Aprovador e Busca dentro de um
   Collapsible "Mais filtros" (fechado). Badge Reconciliado/Não reconciliado mantido.
2. Frase: buildNarrativaRisco(pf), texto grande (text-lg), sem cor.
3. <RiscoKpis pf={pf} />.
4. <RubricaChips … /> (a seleção alimenta o filtro de rubricas existente).
5. <OndeAgirList … /> com onVerTodos abrindo o Collapsible da tabela completa (estado controlado).
6. Collapsible "Como chegamos nesse número" (fechado): <SaldoBridge totals exerciseYear incluirLegado />.
7. Collapsible "Todos os projetos" (fechado): <ProjetoSaldoTable … /> (como está hoje).
8. Collapsible "Auditoria" (fechado): <SaldoAuditPanel … /> (remova o botão interno de abrir/fechar dele, se houver duplicidade).

Remova da página: o <SaldoPotencialCard variant="full"> e o <RubricaRiskPanel> (os arquivos ficam no repositório).
SaldoBridge: acrescente a prop `incluirLegado?: boolean` e repasse para buildSaldoBridge; com ela, a linha de premissa
textual abaixo da ponte deixa de ser exibida (o legado já está na ponte).
Estado reconciliation.ok = false: frase e KPIs dão lugar ao aviso; chips, lista e collapsibles continuam.

Aceite: `npx tsc -b`, `npm test` verdes. Rode `npm run build` e depois `git checkout -- public/data`. Pare.
```

### C0 · Investigação da Visão Executiva (modo **Ask**, somente leitura)

```
Somente leitura — NÃO edite nenhum arquivo.
Em src/pages/RadarExecutivoPage.tsx responda com trechos de código e arquivo:linha:
1. Quais variáveis guardam: a lista filtrada usada nos KPIs; o ano selecionado; o filtro de programa/rubricas.
2. Onde e como é calculado o KPI "Em risco" (R$ 33,9M, 80 projetos): função, entrada e estrutura por projeto
   (nome, valor, gestor/aprovador). Existe uma lista por projeto já pronta (ex.: risk.projects)?
3. Como o card "Fluxo de caixa" é renderizado: componente, props recebidas e de onde vêm "Planejado acumulado" e "Realizado acumulado".
4. Os componentes "Execução do Plano" e "Ritmo de execução": nomes, arquivos e props.
5. O trecho JSX exato que vai da linha de KPIs até o fim do corpo (o que seria substituído por um corpo v2),
   com as linhas de início e fim.
Responda em tabelas curtas, sem propor mudanças.
```

### C1 · Componentes da Visão Executiva v2

```
#file:PLANO_UX_V2_IMPLEMENTACAO.md #file:UX_REVISAO_TELAS_EXECUTIVAS.md #file:src/features/executivo/types.ts #file:src/components/ui/primitives.tsx #file:src/lib/format.ts

Tarefa C1: componentes de apresentação da Visão Executiva v2 (seção 3 de UX_REVISAO). Você PRECISA criar arquivos.
Sem regra de negócio; tokens existentes; claro/escuro; fmtBRL(v, true) com tooltip do valor exato.

1. src/features/executivo/NarrativaBanner.tsx — props { texto: string }. Parágrafo text-lg, sem card pesado, sem cor.
2. src/features/executivo/KpiTriplet.tsx — props { k: KpisExecutivos; onComprometidoClick?: () => void }.
   Três cards (3 colunas desktop, 1 mobile):
   · CAIXA {ano}: fmt(caixa) "de" fmt(orcamento) (BG Gov, InfoTooltip "Orçamento aprovado BGQ3"); sublinha
     "{pctCaixa} · {+/−fmt(desvio)} vs plano" (omitir a parte nula) e linha menor "inclui {fmt(emPagamento)} em pagamento".
   · COMPROMETIDO: "{pctComprometido} do orçamento"; se excesso > 0: "● {fmt(excesso)} acima" em text-risk-critico e linha menor
     "{fmt(excessoSemLegado)} desconsiderando o legado (premissa)" quando excessoSemLegado != null. Card clicável (onComprometidoClick)
     com texto "ver execução detalhada →". Nunca verde.
   · FOLGA PARADA: fmt(folgaParada) e "{projetosParados} projeto(s) · 6+ meses"; se null: "—" e "saldo de projetos indisponível".
3. src/features/executivo/AttentionList.tsx — props { itens: AttentionItem[]; onNavigate(href: string): void }.
   Título "O que merece atenção". Cada linha: marcador (● risk-critico ACIMA; ● âmbar RCS_EM_RISCO; ○ neutro PARADO),
   projectName (truncate), detail, owner em linha menor, e o valor à direita. Linha inteira é <button> que chama onNavigate(href).
   Vazio: "Nada fora do esperado no recorte." Rodapé: "Ver risco de caixa →" (onNavigate("/risco-caixa")).

Não altere arquivos existentes. Aceite: `npx tsc -b` limpo, `npm test` verde. Pare.
```

### C2 · Corpo v2 atrás da flag

> **Substituído pela versão final da seção 4.1** (após o C0). Esqueleto original, só como histórico:

```
#file:PLANO_UX_V2_IMPLEMENTACAO.md #file:src/pages/RadarExecutivoPage.tsx #file:src/features/executivo/* #file:src/features/saldo/useSaldoProjetos.ts #file:src/features/saldo/saldo.ts

Tarefa C2. Você PRECISA editar.
1. Crie src/features/executivo/ExecutivoV2Body.tsx recebendo da página (props): lista filtrada, ano, rubricas,
   o nó do gráfico de fluxo já montado (ReactNode), os nós de Execução do Plano e Ritmo já montados (ReactNode),
   a lista de projetos em risco do Radar e planejadoAcumulado.
   Monta: NarrativaBanner(buildNarrativaExecutiva(k)) → KpiTriplet → grid [Fluxo (col 8) | AttentionList (col 4)] →
   Collapsible "Execução detalhada" (fechado; abre também via onComprometidoClick) contendo Execução do Plano + Ritmo.
   Adaptadores no próprio arquivo: acima (da lista: saldo total < −tol por projeto), emRisco (do Radar), parados (saldo BI).
2. Em RadarExecutivoPage: envolva o trecho identificado no C0 (KPIs → fim do corpo) em
   {import.meta.env.VITE_HOME_V2 === "true" ? <ExecutivoV2Body …/> : (<>…trecho atual inalterado…</>)}.
   Não altere nenhuma outra linha.
3. vite-env.d.ts: acrescente VITE_HOME_V2?: string.
Aceite: flag off → git diff mostra só o wrapper + import; tsc/test/build verdes; `git checkout -- public/data`. Pare.
```

### D1 · Fechamento

- Atualizar `UX_REVISAO_TELAS_EXECUTIVAS.md` com prints antes/depois.
- Vercel → Preview: `VITE_FEATURE_SALDO_PROJETOS=true`, `VITE_HOME_V2=true`. Production: ambas sem valor até a validação com a diretoria.

---

## 4.1 Achados do C0 e C2 final (18/10)

| Achado | Decisão |
|---|---|
| Lista dos KPIs = `listaAno` (L103); Ritmo usa `listaAno26` | v2 recebe as duas |
| `risk = buildProjectsAtRisk(opRows)`, `risk.projects` pronto; **chave = só `projectName`** (≠ `n4\|nomeLB` do saldo); dono = `platformManager` | Adaptador `emRiscoDe`: nome único na `listaAno` → `p.id` (dedup com saldo); ausente/ambíguo → `"risco:"+nome` |
| `flow = buildFlowSummary(listaAno)` dá `planejadoAcumulado` (R$ 73M) | `desvioPlano` = caixa − `flow.planejadoAcumulado` |
| Corpo = L260–369 (KPIs, faixa de saldo, grid); painéis laterais L371–381 fora | Ternário só em volta de L260–369, sem reindentar |
| Aba 2027: fluxo vira placeholder, Em risco "—", Ritmo fica em 2026 | **v2 só em 2026**: `VITE_HOME_V2 === "true" && ano === 2026`; 2027 continua 100% atual |
| Lado direito do fluxo (Realizado/Planejado/Desvio) | Sai na v2: já está no KPI Caixa |
| Teto BG no gráfico de fluxo | Fora do escopo (exigiria mudar `FluxoCaixaChart`) |

Fontes da lista de atenção na v2: **acima** e **parados** vêm da seção de saldo (mesma base do Risco de Caixa, 72 e 16 projetos sem filtro); **emRisco** vem de `risk.projects`. Os KPIs vêm da `listaAno`, com os mesmos campos da Execução do Plano (Comprometido = 104,5% sem filtro).

## 4.2 Revisão de rumo (18/10, noite) — decisões do usuário

| # | Decisão |
|---|---|
| V1 | **Visão Executiva v2 descartada** (C2/C2b/C2c guardados em `git stash`, nada publicado). A tela original continua. |
| V2 | Aba 2026 da Visão Executiva: cartões **BG Gov 26 (BG Vivo no contexto) · Realizado 26 · Em pagamento · Compromisso 26 · Compromisso 27 · Em risco (ⓘ com a definição)**. Saem BG Vivo (vira contexto) e A emitir. Aba 2027 não muda. |
| V3 | Compromisso 27 = Σ RCs classificadas **CAIXA_27** pelo Radar (regra da Classificação Risco Empenho); confirmar se a Curadoria altera a classificação ou só a criticidade (E1, item a). |
| V4 | Risco de Caixa ganha filtro **Plurianual (padrão) \| 2026**. 2026 = tela atual (BI reconciliado). Plurianual = carteira: orçamento plurianual × (realizado + em pgto 2026+2027) × compromisso total. Sem extração nova do BI. |
| V5 | Estouro em **dois níveis**: vermelho = caixa > plurianual (mesma regra do "Estouro" do app, `desvioPlurianual > 0`); âmbar = caixa + compromisso > plurianual. |
| V6 | Folga parada na Plurianual = saldo potencial do BI com selo **"2026"**. 2027 no filtro fica para depois. |

Sequência: E1 (cartões) → R1 (lógica plurianual) → R2 (UI do filtro). Os módulos `executivo/kpis.ts`, `attention.ts` e os componentes do C1 ficam sem uso; remoção na limpeza do D1 (`narrativa.ts` continua, usado pelo Risco de Caixa).

## 4.3 Novos achados (18/10, 23h)

| # | Achado / pedido | Encaminhamento |
|---|---|---|
| F | Filtro de Rubrica inconsistente entre telas: com RESERVA, a Visão Executiva filtra cartões e RCs (3 projetos, R$ 115K em risco); a Classificação Risco Empenho filtra só o card Delta Caixa (BG R$ 1,3M) e mantém RCs impactadas, gargalo, chips de etapa e lista sem filtro; a Curadoria não filtra cartões nem lista | F0 (investigação somente leitura) → F1 (predicado de filtro único aplicado a cartões e lista nas 3 telas) |
| R | Visão plurianual + filtro de ano no Risco de Caixa ainda não implementada | R1 (lógica) → R2 (tela) |
| X | Incluir a "data previsão" da planilha *Acompanhamento de compras C&P - Caixa 2026.xlsx* (SharePoint), 2 abas | Aguardando o arquivo anexado para mapear colunas e chave (RC/OC) |

## 5. Validação visual (critérios de aceite de produto)

### Risco de Caixa v2

| # | Critério |
|---|---|
| R1 | Primeira dobra (1366×768) mostra frase, 2 KPIs, chips e o começo de "Onde agir", sem rolar |
| R2 | Ponte com legado: −4,46 − 2,01 = **−6,48** (= excesso do KPI Comprometido da home) |
| R3 | Folga parada = **R$ 3,1M / 16 projetos** (igual à faixa atual) |
| R4 | Clique num chip filtra KPIs, frase e lista |
| R5 | No máximo 15 números visíveis na primeira dobra |

### Visão Executiva v2

| # | Critério |
|---|---|
| E1 | Flag off: idêntica à atual (print lado a lado) |
| E2 | Comprometido = **104,4% · R$ 6,5M acima** · "R$ 4,5M desconsiderando o legado" |
| E3 | Caixa = **R$ 89M de R$ 145M (61%)** · desvio igual ao do gráfico de fluxo |
| E4 | Lista de atenção com 5 itens nominais, cada um navegando para a tela certa |
| E5 | Execução do Plano e Ritmo continuam acessíveis em "Execução detalhada" |
| E6 | No máximo 15 números visíveis na primeira dobra (hoje ~45) |
| E7 | Filtros de Programa/Rubrica e aba 2027 continuam funcionando na v2 |
