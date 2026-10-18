# Saldo de Projetos & Risco de Caixa por Rubrica — Pacote de Implementação

> **Projeto:** `capex-dashboard-react`
> **Tipo:** extensão **aditiva** (nova fonte DAX + novo JSON + widget + rota `/risco-caixa`)
> **Status:** arquitetura fechada sobre as medidas reais da pasta `9-Saldo Projetos`
> **Revisão:** v3 — 18/10/2026. Incorpora as decisões de negócio da seção 9: slicer Ano = 2026,
> compromisso legado desconsiderado de propósito, saldo parado da home passa ao critério do BI.

Mantenha este arquivo na raiz do repositório e referencie-o com `#file:SALDO_PROJETOS_IMPLEMENTACAO.md`
em todos os prompts do GitHub Copilot (seção 8). A consulta de extração está em `saldo projetos/saldo_projetos.dax`.

---

## 0. Invariantes (o que NÃO pode mudar)

| Item | Regra |
|---|---|
| `public/data/carteira-processed.json` | Idêntico antes/depois, ignorando `dataBase`/`atualizadoEm` (`node scripts/carteira-baseline.mjs check`). É o gate de regressão. |
| `public/data/radar-bundle.json` | Idêntico, exceto `generatedAt`. |
| `csvProcessingCore.ts`, `consolidateCommitments.ts`, `metrics.ts`, `insights.ts`, `merge.ts` | Nenhuma linha alterada. |
| `executive.ts` | **Única exceção, etapa P4:** um campo **opcional** novo em `BuildInsightsInput` (`saldoParadoCriterio`), com default igual ao texto atual. Nenhuma função muda de comportamento sem o campo. |
| `src/types/index.ts` (`ProjetoBase`, `RelatorioParsing`) | Nenhuma linha alterada. |
| `src/features/radar/types.ts` | **Somente append** no fim do arquivo. |
| `HomeExecutive.tsx` | **Única exceção, etapa P4:** troca da *fonte* do saldo parado atrás da flag `VITE_SALDO_PARADO_FONTE_BI`. Com a flag desligada, o comportamento é idêntico ao atual. |
| `RadarPage.tsx`, `CashRiskBanner.tsx` | Não alterados. |
| `npm run verify` | Os 128 testes atuais continuam verdes, sem editar nenhum deles. |
| Prebuild | Uma falha na fonte nova **nunca** derruba o build. A fonte é opcional. |

---

## 1. O que as medidas DAX realmente calculam

Pasta `9-Saldo Projetos` do modelo, já resolvida em termos de outras medidas:

| Medida | Definição efetiva | Observação |
|---|---|---|
| `Realizado_Conecta_Ano` | `Realizado_Conecta` (pago + pendente) no ano `YEAR(TODAY())` | **Depende do relógio** |
| `DeltaCaixa_2026` | `ROUND(Orcamento_Cenarios − Realizado_Conecta_Ano, 2)` | Em branco quando uma RC está no escopo |
| `Compromisso por data de aprovação` | `Compromisso_Conecta` com `USERELATIONSHIP(dCalendarioCaixa[Data_id], dRCs[DT_REQ_APROV])` | O calendário passa a filtrar a **data de aprovação da RC** |
| `Compromisso valido` | o anterior, só para RCs com `DT_REQ_APROV ≥ 01/01/YEAR(TODAY())` | **Depende do relógio**. Ignora compromisso de RC aprovada antes do ano. |
| `A emitir valido` | `Orcamento_Cenarios − Realizado_Conecta_Ano − Compromisso valido` | É o **saldo disponível** oficial |
| `Ultima Data Compromisso` | maior data do calendário (no contexto) com `Compromisso por data de aprovação` não vazio | Sensível ao filtro de Ano (ver armadilha A3) |
| `Saldo Projeto` | `"✔️ Saldo"` quando (`Ultima Data` vazia **ou** ≤ hoje − 6 meses) **e** `A emitir valido > 0` | Flag textual |
| `Valor Saldo` | Σ em `NomeLB × Rubrica` de `A emitir valido` quando `Saldo Projeto` está marcado **e** o valor é > R$ 50.000 | É o **saldo potencial** para a diretoria |

### Ponte executiva que sai dessas medidas

```
  Orçamento (BGQ3)                         Orcamento_Cenarios
− Caixa do exercício                       Realizado_Conecta_Ano
= Delta de caixa                           DeltaCaixa_2026
− Compromisso válido (RC aprovada no ano)  Compromisso valido
= Saldo disponível                         A emitir valido
  └─ dos quais parado há 6+ meses e > R$ 50 mil = Saldo potencial   Valor Saldo

  Fora da ponte: Compromisso legado = Compromisso_Conecta − Compromisso valido
  (compromisso de RC aprovada antes de 01/01, que NÃO abate o saldo disponível)
```

### Armadilhas encontradas no DAX (afetam a extração e a leitura)

| # | Armadilha | Consequência | Tratamento na arquitetura |
|---|---|---|---|
| A1 | `YEAR(TODAY())` em `Realizado_Conecta_Ano` e `Compromisso valido` | Uma extração em janeiro/2027 com exercício 2026 traz realizado em branco e saldo inflado | A consulta exporta `Data_Referencia = TODAY()`. O process-data bloqueia (`yearGuard`) quando o ano da fonte ≠ ano da referência. |
| A2 | `Compromisso valido` ignora compromissos de RCs aprovadas antes do ano | **Decisão de negócio:** esses compromissos são desconsiderados porque a área acredita que não vão se realizar. | Exportar também `Compromisso_Conecta` e mostrar o **compromisso legado** como **premissa** (tom neutro, não alarme), para a diretoria ver quanto foi desconsiderado. |
| A3 | `Ultima Data Compromisso` itera o calendário **no contexto**, e o calendário filtra a data de aprovação | Com Ano = 2026, um projeto com última RC em 2025 aparece "sem data" e vira "Saldo". | **Resolvido:** a página do BI usa slicer Ano = 2026. A consulta reproduz o mesmo contexto. |
| A4 | `Valor Saldo` aplica o corte de R$ 50 mil **por `NomeLB × Rubrica`** | Recalcular o corte sobre totais (projeto, rubrica, carteira) dá outro número | O front **só soma** `saldoPotencial` linha a linha. Nunca reaplica a regra num agregado. |
| A5 | O app já tem um "saldo parado" próprio (`executive.ts`): janela de 60 dias, saldo = orçamento − executado − compromisso **total** | Duas definições de saldo convivendo | **Decisão de negócio:** a home passa a usar o critério do BI (etapa P4, seção 5.7). O cálculo antigo continua só como fallback e na ponte do caixa projetado. |

---

## 2. Decisões de arquitetura

| # | Decisão | Motivo |
|---|---|---|
| D1 | Arquivo próprio `public/data/saldo-projetos.json`, não um nó dentro de `carteira-processed.json` | O JSON oficial fica intocado e verificável. Se o saldo falhar, só o widget some. |
| D2 | Grão `N4 × 1º Aprovador × NomeLB × Rubrica`, com exercício único. `projectKey = normalizeKey(n4)\|normalizeKey(nomeLB)` | É o grão em que `Valor Saldo` é avaliado (A4) e é igual ao `ProjetoBase.id`. O aprovador dá o "PO responsável" à diretoria. |
| D3 | Filtros da consulta copiados de `Realizado.dax` | Orçamento e caixa reconciliam por construção com a base que já está em produção. |
| D4 | O front consome os valores do BI, **sem recalcular nada**. O process-data só **verifica** as identidades (seção 3.4). | O BI é a fonte da verdade. Qualquer divergência vira alerta, não uma "correção" silenciosa. |
| D5 | A reconciliação é dado (`reconciliation.ok`), não exceção | Um `throw` quebraria o deploy. A UI esconde os KPIs quando `ok = false`, como em `resumo.reconciles`. |
| D6 | Rota `/risco-caixa` com `React.lazy`. Flag `VITE_FEATURE_SALDO_PROJETOS` controla a navegação e o widget da home. | Mesmo padrão de `/radar`. O `vercel.json` já cobre a rota. |
| D7 | A `dataReferencia` vem da fonte (`Data_Referencia`), não de `new Date()` | A janela de 6 meses é avaliada no BI. O front exibe "referência dd/mm" e mede "há N meses" a partir dela. |

---

## 3. Contrato de dados

### 3.1 Fonte: `public/data/Saldo_Projetos.csv`

Saída de `saldo projetos/saldo_projetos.dax`, no mesmo formato dos CSVs atuais (`;`, decimal pt-BR, BOM opcional).

```
N4;1º Aprovador;NomeLB;Ano;Rubrica;Orcamento_Cenarios;Realizado_Conecta_Ano;DeltaCaixa_2026;
Compromisso_Conecta;Compromisso_Valido;A_Emitir_Valido;Ultima_Data_Compromisso;Saldo_Projeto;
Valor_Saldo;Data_Referencia
```

| Coluna | Tipo | Vazio significa |
|---|---|---|
| medidas numéricas | decimal pt-BR | 0 |
| `Ultima_Data_Compromisso`, `Data_Referencia` | data (`AAAA-MM-DD[ hh:mm:ss]` ou `dd/mm/aaaa`) | `null` (`Data_Referencia` vazia é erro) |
| `Saldo_Projeto` | texto | flag `false`. Qualquer texto contendo "Saldo" = `true`. |

### 3.2 Configuração: `src/features/saldo/saldoConfig.ts`

```ts
/** Nomes exatos das colunas de Saldo_Projetos.csv (= aliases em saldo_projetos.dax). */
export const SALDO_COLUMNS = {
  n4: "N4",
  aprovador: "1º Aprovador",
  nomeLB: "NomeLB",
  ano: "Ano",
  rubrica: "Rubrica",
  orcamento: "Orcamento_Cenarios",
  caixa: "Realizado_Conecta_Ano",
  deltaCaixa: "DeltaCaixa_2026",
  compromissoTotal: "Compromisso_Conecta",
  compromissoValido: "Compromisso_Valido",
  saldoDisponivel: "A_Emitir_Valido",
  ultimaDataCompromisso: "Ultima_Data_Compromisso",
  flagSaldo: "Saldo_Projeto",
  saldoPotencial: "Valor_Saldo",
  dataReferencia: "Data_Referencia",
} as const;

/** Espelho das regras do BI. Usado SÓ para verificar identidades, nunca para recalcular. */
export const SALDO_BI_RULES = { corteValorSaldo: 50_000, janelaMeses: 6 } as const;

export const SALDO_RECONCILE_TOLERANCE = 1;      // R$, contra a carteira oficial
export const SALDO_IDENTITY_TOLERANCE = 0.02;    // R$, por linha (DeltaCaixa é arredondado)
export const SALDO_SIGNAL_TOLERANCE = 1_000;     // R$, para negativos de sinal
export const SALDO_LEGADO_MATERIAL = 50_000;     // R$, a partir do qual a nota de premissa (legado) aparece

/** Texto do critério de saldo parado do BI, usado na home e nos insights. */
export const SALDO_PARADO_CRITERIO_BI = "sem compromisso aprovado há 6+ meses (critério BI)";
```

### 3.3 Extensão de `src/features/radar/types.ts` (append-only)

```ts
// ─────────────────────────────────────────────────────────────
// Saldo de projetos — fonte DAX "9-Saldo Projetos", arquivo próprio
// (public/data/saldo-projetos.json). Não altera nenhum contrato acima.
// ─────────────────────────────────────────────────────────────

/** Linha de Saldo_Projetos.csv normalizada. Grão N4×Aprovador×NomeLB×Rubrica, exercício único. */
export interface SaldoProjetoLinha {
  /** normalizeKey(n4)|normalizeKey(nomeLB) — igual a ProjetoBase.id */
  projectKey: string;
  n4: string;
  aprovador: string | null;
  nomeLB: string;
  rubrica: string;
  ano: number;
  orcamento: number;              // Orcamento_Cenarios (BGQ3)
  caixa: number;                  // Realizado_Conecta_Ano (pago + pendente)
  deltaCaixa: number;             // DeltaCaixa_2026
  compromissoTotal: number;       // Compromisso_Conecta
  compromissoValido: number;      // Compromisso valido (RC aprovada no exercício)
  saldoDisponivel: number;        // A emitir valido
  ultimaDataCompromisso: string | null; // ISO yyyy-mm-dd
  flagSaldo: boolean;             // Saldo Projeto = "✔️ Saldo"
  saldoPotencial: number;         // Valor Saldo (0 quando BLANK)
}

/** Totais de um recorte (carteira, projeto ou rubrica). Somas simples das linhas. */
export interface SaldoTotals {
  orcamento: number;
  caixa: number;
  deltaCaixa: number;
  compromissoTotal: number;
  compromissoValido: number;
  /** compromissoTotal − compromissoValido: RC aprovada antes do exercício, não abate o saldo */
  compromissoLegado: number;
  saldoDisponivel: number;
  saldoPotencial: number;
  projetos: number;               // projectKeys distintos
  projetosComSaldo: number;       // projectKeys distintos com saldoPotencial > 0
}

/** Verificação contra a carteira oficial. */
export interface SaldoReconcileCheck {
  label: "orcamento" | "caixa" | "compromisso";
  saldo: number;
  carteira: number;
  delta: number;
  ok: boolean;
}

/** Linha em que o valor do BI não bate com a própria definição da medida. */
export interface SaldoIdentityError {
  projectKey: string;
  rubrica: string;
  rule: "A_EMITIR_VALIDO" | "VALOR_SALDO";
  expected: number;
  actual: number;
}

/** Payload completo de public/data/saldo-projetos.json. */
export interface SaldoProjetosSection {
  schemaVersion: 1;
  generatedFrom: "Saldo_Projetos.csv";
  generatedAt: string;            // ISO, run do prebuild
  exerciseYear: number;           // Ano único da fonte
  dataReferencia: string;         // ISO, TODAY() do modelo na extração
  linhas: SaldoProjetoLinha[];
  totals: SaldoTotals;
  reconciliation: {
    /** checks.ok && identityErrors vazio && yearGuard.ok */
    ok: boolean;
    checks: SaldoReconcileCheck[];          // orcamento, caixa (bloqueiam)
    warnings: SaldoReconcileCheck[];        // compromisso (informativo)
    identityErrors: SaldoIdentityError[];   // no máximo 20, ordenados por |expected − actual|
    yearGuard: { ok: boolean; anosNaFonte: number[]; anoReferencia: number };
    orphanProjects: { count: number; saldoDisponivel: number; keys: string[] };
  };
  discardedLines: number;
}

/** Sinal executivo por recorte (V1, determinístico, derivado só de valores do BI). */
export type SaldoSignal =
  | "ESTOURO_CAIXA"        // caixa do ano já passou do orçamento
  | "SEM_ORCAMENTO"        // orçamento 0 (Filtro Saldo Projeto do BI = 0)
  | "COMPROMETIDO_ACIMA"   // caixa + compromisso válido > orçamento
  | "SALDO_PARADO"         // saldo potencial > 0 (regra do BI: 6 meses + R$ 50 mil)
  | "SALDO_RESIDUAL"       // flag de saldo do BI, mas abaixo de R$ 50 mil
  | "EM_EXECUCAO";

/** Visão agregada em memória para a tela e o widget. */
export interface SaldoRecorteView extends SaldoTotals {
  key: string;                    // projectKey ou rubrica
  label: string;
  aprovador: string | null;       // só no recorte por projeto
  ultimaDataCompromisso: string | null; // maior data entre as linhas
  linhasComFlag: number;
  pctCaixa: number | null;        // caixa / orcamento
  pctSaldo: number | null;        // saldoDisponivel / orcamento
  signal: SaldoSignal;
}
```

### 3.4 Verificações gravadas em `reconciliation`

| Verificação | Regra | Bloqueia KPIs? |
|---|---|:--:|
| `yearGuard` | todas as linhas com o mesmo `Ano` **e** `Ano === ano(Data_Referencia)` | ✔ |
| Identidade `A_EMITIR_VALIDO` (por linha) | `\|saldoDisponivel − (orcamento − caixa − compromissoValido)\| ≤ 0,02` | ✔ |
| Identidade `VALOR_SALDO` (por linha) | `saldoPotencial === (flagSaldo && saldoDisponivel > 50.000 ? saldoDisponivel : 0)` (±0,02) | ✔ |
| `orcamento` | Σ `orcamento` vs Σ `ProjetoBase.orcamento2026` (BG_Q3 de `orcamento.csv`) | ✔ |
| `caixa` | Σ `caixa` vs Σ (`realizado2026` + `emPagamento2026`) | ✔ |
| `compromisso` | Σ `compromissoTotal` vs Σ `ProjetoBase.compromisso` | — (warning) |
| órfãos | `projectKey` ausente da carteira | — (exibido na auditoria) |

> O check de compromisso é só informativo porque `ProjetoBase.compromisso` é o máximo entre os anos
> (`maxPorAno` em `buildProjetos`), não uma soma por exercício.

---

## 4. Ponto de acoplamento no pipeline

```
BI ── saldo projetos/saldo_projetos.dax ──► public/data/Saldo_Projetos.csv   (novo, opcional)

scripts/preprocessCsv.mjs (process-data / prebuild)
  1. parseCsvCarteira(...)        ──► carteira-processed.json  (inalterado)
  2. consolidarCompromissos(...)  ──► radar-bundle.json        (inalterado)
  3. NOVO, por último:
     buildSaldoProjetosSection({ csv, projetos: <relatorio>.projetos, generatedAt })
                                  ──► saldo-projetos.json      (novo)
```

**Regras do bloco novo**

1. Fica depois de todas as escritas existentes e reaproveita em memória o `RelatorioParsing` já calculado.
2. CSV ausente: remove um `saldo-projetos.json` antigo, se houver, loga `info` e segue.
3. Erro de parse (coluna faltando, `Data_Referencia` vazia): loga `warn`, remove o JSON antigo e segue. Exit 0.
4. `reconciliation.ok = false`: grava o JSON assim mesmo e loga `warn` com checks, `yearGuard` e as 5 primeiras divergências de identidade.
5. Nenhuma linha existente do script muda. Entram só imports novos e o bloco novo.
6. **Extração:** adicionar `saldo projetos/saldo_projetos.dax` → `public/data/Saldo_Projetos.csv` à lista de consultas de `scripts/atualizar-dados-bi.ps1`. É uma entrada nova; as existentes não mudam.

**Módulo de processamento: `src/lib/saldoProjetosCore.ts`** (função pura)

```ts
export function buildSaldoProjetosSection(input: {
  csv: string;
  projetos: ProjetoBase[];
  generatedAt: string;
}): SaldoProjetosSection
```

- Importa `csvObjects` e `normalizeKey` de `csvProcessingCore.ts`, só por import.
- Cria locais `parseNumberPtBr` (mesma lógica do `toNumberOrNull` interno de lá) e `parseDateLoose`
  (`AAAA-MM-DD[ hh:mm:ss[,SSS]]` e `dd/mm/aaaa` → ISO `yyyy-mm-dd`).
- Lança `Error` quando falta uma coluna de `SALDO_COLUMNS` ou quando `Data_Referencia` é inválida.
- Descarta linhas sem `N4`/`NomeLB` ou com `Ano` não inteiro e conta em `discardedLines`.
- `exerciseYear` = moda de `Ano`. O `yearGuard` registra todos os anos encontrados.

---

## 5. Estrutura de componentes

### 5.1 Arquivos novos

```
saldo projetos/saldo_projetos.dax      consulta de extração (entregue junto deste documento)
src/features/saldo/
├── saldoConfig.ts                      seção 3.2
├── saldo.ts                            agregação, sinal, ponte
├── saldo.test.ts
├── useSaldoProjetos.ts                 fetch + cache de módulo
├── SaldoPotencialCard.tsx              widget executivo
├── RiscoCaixaPage.tsx                  página /risco-caixa
├── SaldoBridge.tsx                     ponte Orçamento → Saldo potencial
├── RubricaRiskPanel.tsx                barras por rubrica
├── ProjetoSaldoTable.tsx               tabela por projeto
└── SaldoAuditPanel.tsx                 reconciliação + divergências (fechado por padrão)
src/lib/
├── saldoProjetosCore.ts
└── saldoProjetosCore.test.ts
```

### 5.2 Funções puras (`saldo.ts`)

```ts
filterSaldoLinhas(linhas, f: { projectKeys?: ReadonlySet<string>; rubricas?: string[]; n4?: string | null; busca?: string }): SaldoProjetoLinha[]
summarizeSaldo(linhas): SaldoTotals
aggregateSaldoBy(linhas, dim: "projeto" | "rubrica"): SaldoRecorteView[]
classifySaldo(t: SaldoTotals & { linhasComFlag: number }): SaldoSignal
buildSaldoBridge(t: SaldoTotals): Array<{ label: string; value: number; kind: "base" | "minus" | "result" | "sub" }>
mesesDesde(isoDate: string | null, dataReferencia: string): number | null
topBySaldoPotencial(views, n): SaldoRecorteView[]
```

**Regra de sinal (ordem de precedência, `tol = SALDO_SIGNAL_TOLERANCE`):**

| # | Sinal | Condição |
|:--:|---|---|
| 1 | `ESTOURO_CAIXA` | `deltaCaixa < −tol` |
| 2 | `SEM_ORCAMENTO` | `orcamento === 0` |
| 3 | `COMPROMETIDO_ACIMA` | `saldoDisponivel < −tol` |
| 4 | `SALDO_PARADO` | `saldoPotencial > 0` |
| 5 | `SALDO_RESIDUAL` | `linhasComFlag > 0` (flag do BI, mas abaixo de R$ 50 mil) |
| 6 | `EM_EXECUCAO` | demais |

Invariantes testáveis:
- Σ `aggregateSaldoBy(..., dim)` = `summarizeSaldo` para as duas dimensões.
- `saldoPotencial` de qualquer agregado = soma das linhas. Nunca reaplica o corte (A4).

### 5.3 Hook `useSaldoProjetos`

```ts
type SaldoState =
  | { status: "loading" }
  | { status: "unavailable" }                   // 404: fonte ainda não publicada
  | { status: "error"; message: string }
  | { status: "ready"; section: SaldoProjetosSection };
```

Mesmo padrão de `dataSource.ts` (`BASE_URL`, `cache: "no-store"`), promise em cache de módulo e validação de `schemaVersion === 1`.

### 5.4 Widget `SaldoPotencialCard` (diretoria)

```ts
interface SaldoPotencialCardProps {
  projectKeys?: ReadonlySet<string>;   // escopo da tela hospedeira; undefined = carteira toda
  variant?: "compact" | "full";
  topN?: number;                       // default 5, só em "full"
  onOpenDetail?: () => void;           // default navigate("/risco-caixa")
}
```

| Estado | `compact` | `full` |
|---|---|---|
| `loading` | skeleton (padrão `CashRiskBanner`) | skeleton |
| `unavailable` / `error` | `null` | card neutro com a explicação |
| `reconciliation.ok = false` | aviso + "Ver auditoria" | aviso com o motivo (`yearGuard`, check ou identidade) |
| `saldoPotencial = 0` no recorte | "Nenhum projeto com saldo parado" | idem |
| `ready` | ver layout | ver layout |

```
┌ SALDO POTENCIAL DOS PROJETOS ─────────────── Exercício 2026 · ref. 17/10 ┐
│  R$ 9,7 mi            10% do orçamento · 21 projetos parados há 6+ meses  │
│  ██████████████▓▓▓▓▓▓░░░░░░   Caixa | Compromisso válido | Saldo disp.    │
│  ── full ───────────────────────────────────────────────────────────────  │
│  Premissa: R$ 3,1 mi em compromissos de RCs anteriores a 2026 desconsiderados │
│  1. Projeto X · Fulano ……… R$ 2,1 mi   último compromisso há 9 meses      │
│  2. Projeto Y · Beltrano … R$ 1,4 mi   sem compromisso aprovado em 2026   │
│                                               Ver risco de caixa →        │
└───────────────────────────────────────────────────────────────────────────┘
```

- A nota de premissa (legado) aparece **só em `full`**, em `text-text-muted`, sem ícone de alerta, quando `compromissoLegado ≥ SALDO_LEGADO_MATERIAL` (A2).
- `ultimaDataCompromisso = null` é rotulado "sem compromisso aprovado em <exercício>" (fiel ao contexto da A3), nunca "nunca movimentou".
- Só tokens de cor existentes. Nenhuma cor literal.
- Montagem na home: logo abaixo de `<CashRiskBanner />`, no componente pai dele, como `variant="compact"`, envolvido pela flag. `HomeExecutive.tsx` não é tocado.

### 5.5 Página `RiscoCaixaPage` (`/risco-caixa`)

```
┌ ← Voltar   RISCO DE CAIXA & RUBRICAS     Exercício 2026 · referência BI 17/10   [✓ Reconciliado] ┐
├ [Programa ▾] [Rubrica ▾ multi] [Aprovador ▾] [🔍 busca]                                           ┤
├─────────────────────────────────────────────────┬──────────────────────────────────────────────┤
│ <SaldoBridge>                                    │ <SaldoPotencialCard variant="full"           │
│  Orçamento                  98,0                 │    projectKeys={escopo} />                   │
│  − Caixa do exercício       61,2   62%           │                                              │
│  = Delta de caixa           36,8                 │                                              │
│  − Compromisso válido       24,4                 │                                              │
│  = Saldo disponível         12,4   13%           │                                              │
│    └ Saldo potencial         9,7  (parado 6m+)   │                                              │
│  Premissa: legado 3,1 desconsiderado (fora)      │                                              │
├─────────────────────────────────────────────────┴──────────────────────────────────────────────┤
│ <RubricaRiskPanel>  por rubrica: barra Caixa | Comp. válido | Saldo disp. sobre o orçamento;    │
│   valores, % e chip de sinal; clique filtra a tabela                                            │
├────────────────────────────────────────────────────────────────────────────────────────────────┤
│ <ProjetoSaldoTable>  Projeto │ Aprovador │ Programa │ Orçamento │ Caixa │ %Caixa │ Comp. válido │ │
│   Comp. legado │ Saldo disp. │ Saldo pot. │ Último compromisso │ Sinal                          │
│   ordem padrão: saldoPotencial desc; linha expande as rubricas inline                           │
├────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ▸ Auditoria  <SaldoAuditPanel>: yearGuard, checks/warnings, identityErrors, órfãos e            │
│   top 10 |saldo oficial − saldo derivado do app| (fórmula de buildProjectBalances)              │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

| Fonte | Uso |
|---|---|
| `useSaldoProjetos()` | linhas, totais, reconciliação |
| `usePortfolioData()` (só leitura) | `n4Curta`, `gestor` e os campos de `ProjetoBase` para a auditoria |
| `useState` local | `programa`, `rubricas`, `aprovador`, `busca`, `auditOpen` |

- Com `reconciliation.ok = false`, a ponte e o widget mostram o aviso. Rubricas, tabela e auditoria continuam visíveis para diagnóstico.
- Ordenação via `tableSorting.ts`, formatação via `format.ts`. Nenhuma lib nova.
- O saldo derivado da auditoria é calculado **na página**
  (`orcamento2026 − realizado2026 − emPagamento2026 − compromisso`), sem importar `executive.ts`.
  A diferença esperada é ≈ o compromisso legado (A2, A5).

### 5.6 Roteamento e navegação

- No componente que decide `useCurrentPath() === "/radar"`, entra um ramo novo `"/risco-caixa"`
  → `<Suspense><RiscoCaixaPage /></Suspense>` (`React.lazy`).
- Botão "Risco de Caixa" ao lado da navegação existente para `/radar`, só com a flag ligada.
- Sem mudanças em `simpleRouter.ts` e `vercel.json`.

### 5.7 Saldo parado da home com o critério do BI (etapa P4)

**Hoje:** `HomeExecutive` calcula `buildProjectBalances(lista, bundle.projectActivity, dbDate)`
(60 dias, compromisso total). O resultado alimenta 5 pontos:

| # | Consumidor em `HomeExecutive` | Muda para o critério do BI? |
|---|---|:--:|
| 1 | Card "Saldo remanejável" (valor + contexto) | ✔ |
| 2 | Painel lateral "Saldo por projeto" (abas, tabela, CSV) | ✔ |
| 3 | `buildInsights({ saldoParadoValue })` | ✔ (com texto do critério) |
| 4 | Rodapé "Saldo parado: N projetos" | ✔ |
| 5 | `buildBridge({ saldoLiquido: balanceSummary.liquido })` | **✘ continua no cálculo atual** |

> A ponte (#5) é uma identidade contábil BG → caixa projetado que fecha com o compromisso
> **total** da carteira. Trocá-la pelo saldo do BI (que exclui o legado) abriria uma "diferença entre
> bases" artificial. Por isso ela fica no cálculo derivado.

**Adaptador novo: `src/features/saldo/saldoBalances.ts`**

```ts
import type { ProjectBalance } from "../radar/executive";

/** Converte o saldo oficial do BI para o mesmo shape usado hoje pela home. */
export function buildProjectBalancesFromSaldo(
  section: SaldoProjetosSection,
  lista: ProjetoBase[],          // escopo filtrado da home: só projectKeys presentes aqui
): ProjectBalance[]
```

Regras por projeto (soma das linhas do `projectKey`, `tol = SALDO_SIGNAL_TOLERANCE`):

| Campo de `ProjectBalance` | Valor |
|---|---|
| `group` | `ACIMA_BG` se Σ`saldoDisponivel` < −tol; senão `PARADO` se Σ`saldoPotencial` > 0; senão `ATIVO_COM_SALDO` se Σ`saldoDisponivel` > tol; senão o projeto **não entra** |
| `saldo` | `PARADO` → Σ`saldoPotencial` (bate com `Valor Saldo` do BI); demais → Σ`saldoDisponivel` |
| `orcamento2026` / `executado` / `compromisso` | Σ`orcamento` / Σ`caixa` / Σ`compromissoValido` |
| `realizado2026` / `emPagamento2026` | do `ProjetoBase` correspondente (só exibição) |
| `projectName`, `n4`, `n4Curta`, `gestor` | do `ProjetoBase` correspondente |
| `lastMovementAt` / `lastMovementType` | maior `ultimaDataCompromisso` / `"COMPROMISSO"` (ou `null`) |
| `daysSinceMovement` | dias entre `lastMovementAt` e `section.dataReferencia` (ou `null`) |

Invariante: `summarizeBalances(resultado).parado.value === Σ saldoPotencial` das linhas no escopo.

**Troca em `HomeExecutive` (mínima, atrás da flag `VITE_SALDO_PARADO_FONTE_BI`)**

```
fonteBI = flag === "true" && saldo.status === "ready" && saldo.section.reconciliation.ok
balancesExibicao = fonteBI ? buildProjectBalancesFromSaldo(section, lista) : projectBalances
summaryExibicao  = summarizeBalances(balancesExibicao)
```

- `projectBalances` / `balanceSummary` atuais continuam calculados e seguem alimentando **só** `buildBridge`.
- Consumidores 1 a 4 passam a ler `balancesExibicao` / `summaryExibicao`.
- `semAtividade` só vale quando `!fonteBI`.
- Textos dependentes da fonte:

| Local | `fonteBI = false` (atual) | `fonteBI = true` |
|---|---|---|
| Contexto do card | `N projetos parados há mais de 60 dias` | `N projetos ${SALDO_PARADO_CRITERIO_BI}` |
| Descrição da aba "Parados" | texto atual | "Saldo = Valor Saldo do BI: rubricas sem compromisso aprovado há 6+ meses e acima de R$ 50 mil." |
| Descrição da aba "Ativos" | texto atual | "Projetos com saldo disponível (A emitir válido) fora do critério de parado." |
| Coluna "Comprometido" | compromisso total | compromisso válido (cabeçalho "Comp. válido") |
| Insight de saldo | "sem movimentação há mais de 60 dias" | `SALDO_PARADO_CRITERIO_BI` |

**Extensão de `executive.ts` (a única):**

```ts
// em BuildInsightsInput — campo opcional novo
saldoParadoCriterio?: string;   // default: "sem movimentação há mais de 60 dias"
// no texto do insight 'acao'/target 'saldo':
`Revisar o saldo parado: R$ ${formatBrl(saldoParadoValue)} ${saldoParadoCriterio ?? "sem movimentação há mais de 60 dias"}.`
```

Sem o campo, a string gerada é idêntica à atual, e os testes existentes de `executive.test.ts` passam sem edição.

---

## 6. Plano de execução e gates

| # | Etapa | Gate |
|---|---|---|
| P0 | Rodar `saldo_projetos.dax` no DAX Studio e comparar o total de `Valor Saldo` com o visual do BI | Total igual ao BI (centavos) |
| P1a | Tipos + config | `tsc -b` limpo, diff só com linhas adicionadas |
| P1b | Core + testes | testes novos verdes |
| P1c | Prebuild | carteira idêntica (`node scripts/carteira-baseline.mjs check`) |
| P2a | `saldo.ts` + hook + testes | invariantes de soma |
| P2b | Widget + montagem por flag | flag off = home idêntica |
| P3a | Página + subcomponentes | renderiza com o JSON real e com o JSON ausente |
| P3b | Rota e nav | `/` e `/radar` sem diferença; `npm run verify` verde |
| P4a | Adaptador `saldoBalances.ts` + campo opcional em `executive.ts` + testes | testes antigos de `executive.test.ts` intocados e verdes |
| P4b | Troca de fonte na home atrás de `VITE_SALDO_PARADO_FONTE_BI` | flag off = home idêntica; flag on = card igual a Σ `Valor Saldo` do BI no escopo |

---

## 7. Testes obrigatórios

**`saldoProjetosCore.test.ts`**
1. Parse pt-BR (`"1.234,56"`, negativo, vazio → 0) e de datas (`2026-03-15 00:00:00`, `15/03/2026`, vazio → `null`).
2. Coluna de `SALDO_COLUMNS` ausente → `throw` com o nome. `Data_Referencia` vazia → `throw`.
3. `Saldo_Projeto = "✔️ Saldo"` → `flagSaldo = true`. Vazio → `false`.
4. `projectKey` igual a `ProjetoBase.id` para `" Gnews  no Estúdio A "`.
5. Identidade `A_EMITIR_VALIDO` quebrada em uma linha → `identityErrors` com 1 item e `ok = false`.
6. Identidade `VALOR_SALDO`: flag + 60.000 → precisa 60.000; flag + 40.000 → precisa 0; sem flag + 90.000 → precisa 0.
7. `yearGuard`: `Ano = 2026` com `Data_Referencia = 2027-01-05` → `ok = false`.
8. Checks de orçamento/caixa: ok dentro de R$ 1, falha com delta de R$ 2. Compromisso divergente vai só para `warnings`.
9. Projeto sem par na carteira → `orphanProjects`.

**`saldo.test.ts`**
1. Um caso por `SaldoSignal`, incluindo as bordas de `±SALDO_SIGNAL_TOLERANCE`.
2. Σ `aggregateSaldoBy` = `summarizeSaldo` para `projeto` e `rubrica`.
3. Agregado com duas linhas de R$ 30 mil com flag e `saldoPotencial = 0` → `saldoPotencial` do agregado = 0, sinal `SALDO_RESIDUAL` (prova da A4).
4. `compromissoLegado = compromissoTotal − compromissoValido`.
5. `buildSaldoBridge`: o último `result` é igual a `saldoDisponivel`.
6. `mesesDesde(null)` → `null`; `mesesDesde("2026-01-17", "2026-10-17")` → 9.

**`saldoBalances.test.ts`**
1. Projeto com Σ`saldoDisponivel` < −1.000 → `ACIMA_BG`, `saldo` = Σ`saldoDisponivel`.
2. Projeto com uma rubrica `saldoPotencial = 120.000` e outra `saldoDisponivel = 30.000` sem flag → `PARADO`, `saldo = 120.000`.
3. Projeto com `saldoDisponivel = 40.000` e flag (residual) → `ATIVO_COM_SALDO`, `saldo = 40.000`.
4. Projeto com saldo 0 → não entra.
5. Projeto fora de `lista` → não entra (respeita o filtro da home).
6. `summarizeBalances(...).parado.value` = Σ`saldoPotencial` do escopo.
7. `daysSinceMovement` medido até `dataReferencia`; sem data → `null`.

**`executive.test.ts`** (só um caso **novo** acrescentado no fim; nenhum existente é editado)
- `buildInsights` com `saldoParadoCriterio = "X"` e saldo parado > curadoria pendente → texto termina em "X.".

---

## 8. Prompts para o GitHub Copilot

### 8.0 Sequência de execução

| Ordem | Quem | Passo | Gate antes de seguir |
|:--:|---|---|---|
| 0 | Você | Pré-requisitos (abaixo) | baseline salvo e total do BI conferido |
| 1 | Copilot | **1a** Tipos e config | `tsc -b` |
| 2 | Copilot | **1b** Core do CSV + testes | vitest do core |
| 3 | Copilot | **1c** Acoplamento no process-data + `.ps1` | carteira idêntica ao baseline |
| 4 | Copilot | **2a** Lógica pura + hook + testes | vitest `src/features/saldo` |
| 5 | Copilot | **2b** Widget + montagem por flag | flag off = home idêntica |
| 6 | Copilot | **3a** Página + subcomponentes | renderiza com e sem JSON |
| 7 | Copilot | **3b** Rota e navegação | `npm run verify` |
| 8 | Copilot | **4a** Adaptador + campo opcional em `executive.ts` + testes | `npm run verify` |
| 9 | Copilot | **4b** Troca de fonte na home (flag) | flag off idêntica; flag on = total do BI |
| 10 | Você | Homologação e publicação (abaixo) | — |

Um prompt por sessão de chat. Faça um commit depois de cada gate verde, para cada etapa ser revertida sozinha.

**Pré-requisitos (manual, antes do 1a)**

1. Crie a branch `feat/saldo-projetos`.
2. Copie `SALDO_PROJETOS_IMPLEMENTACAO.md` para a raiz do repo e `saldo_projetos.dax` para `saldo projetos/saldo_projetos.dax`.
3. Rode `saldo_projetos.dax` no DAX Studio (Results → File, separador `;`) e salve como `public/data/Saldo_Projetos.csv`.
4. Confira no CSV: Σ `Valor_Saldo` = total do visual "Saldo Projetos" do BI. Se não bater, pare e me envie a diferença.
5. Salve o baseline da carteira, ainda sem nenhuma alteração de código:
   ```bash
   npm run process-data
   node scripts/carteira-baseline.mjs save   # script local, não versionado (ver nota abaixo)
   ```
   Nota: o ambiente é Windows/PowerShell, sem `jq` nem `/tmp`. A comparação usa o script Node local
   `scripts/carteira-baseline.mjs` (modos `save` e `check`), com a pasta `.baseline/`. Os dois ficam
   listados em `.git/info/exclude` e nunca são commitados.
6. No `.env.local`: `VITE_FEATURE_SALDO_PROJETOS=true` e `VITE_SALDO_PARADO_FONTE_BI=false` (a segunda só liga no passo 9).

**Homologação e publicação (depois do 4b)**

1. `npm run verify` e `npm run build` verdes.
2. Na tela `/risco-caixa`, o widget, a ponte e a tabela batem com o BI. O badge mostra "Reconciliado".
3. Ligue `VITE_SALDO_PARADO_FONTE_BI=true` e confira o card "Saldo remanejável" contra o `Valor Saldo` do BI com os mesmos filtros.
4. Na Vercel, publique primeiro com as duas flags **desligadas**, depois ligue `VITE_FEATURE_SALDO_PROJETOS` e por fim `VITE_SALDO_PARADO_FONTE_BI`. O rollback é desligar a flag e fazer redeploy.

### Prompt Copilot 1 — Tipagem & Pipeline

#### 1a · Tipos e configuração

```
#file:SALDO_PROJETOS_IMPLEMENTACAO.md #file:src/features/radar/types.ts

Implemente as seções 3.2 e 3.3.

1. Crie src/features/saldo/saldoConfig.ts com exatamente o conteúdo da seção 3.2.
2. Faça APPEND no FINAL de src/features/radar/types.ts com exatamente o bloco da seção 3.3.

Restrições: não altere, reordene nem reformate nenhuma linha existente de types.ts. Sem funções. Nenhum outro arquivo.
Aceite: `npx tsc -b` limpo. O diff de types.ts só tem linhas adicionadas no fim.
```

#### 1b · Processamento do CSV

```
#file:SALDO_PROJETOS_IMPLEMENTACAO.md #file:src/lib/csvProcessingCore.ts #file:src/features/saldo/saldoConfig.ts #file:src/features/radar/types.ts #file:src/features/radar/executive.test.ts

Crie src/lib/saldoProjetosCore.ts com
buildSaldoProjetosSection(input: { csv: string; projetos: ProjetoBase[]; generatedAt: string }): SaldoProjetosSection
conforme as seções 3.1, 3.4 e 4.

Regras:
- Importe csvObjects e normalizeKey de ./csvProcessingCore. NÃO modifique esse arquivo.
- Funções locais: parseNumberPtBr (mesma lógica do toNumberOrNull de csvProcessingCore; vazio → 0)
  e parseDateLoose ("AAAA-MM-DD[ hh:mm:ss[,SSS]]" e "dd/mm/aaaa" → "yyyy-mm-dd"; vazio → null).
- Leia colunas SOMENTE via SALDO_COLUMNS. Nenhum nome de coluna literal no código.
- Coluna ausente ou Data_Referencia inválida → throw Error com o nome da coluna.
- flagSaldo = texto de Saldo_Projeto contém "Saldo" (case-insensitive).
- projectKey = `${normalizeKey(n4)}|${normalizeKey(nomeLB)}`; aprovador vazio → null.
- exerciseYear = Ano mais frequente; yearGuard conforme a seção 3.4.
- Identidades por linha (SALDO_IDENTITY_TOLERANCE, SALDO_BI_RULES.corteValorSaldo) → identityErrors,
  no máximo 20, ordenados por |expected − actual| desc.
- checks (orcamento, caixa) e warnings (compromisso) contra os projetos conforme a seção 3.4,
  com SALDO_RECONCILE_TOLERANCE.
- totals via somas simples (compromissoLegado = total − válido; projetos/projetosComSaldo por projectKey distinto).
- ok = todos os checks ok && identityErrors.length === 0 && yearGuard.ok.
- Função pura: sem fs, sem console, sem Date.now()/new Date() para "hoje".

Crie src/lib/saldoProjetosCore.test.ts com os 9 casos da seção 7 (vitest, CSV inline;
use o mkProjeto de executive.test.ts como modelo de ProjetoBase).
Aceite: `npx vitest run src/lib/saldoProjetosCore.test.ts` verde e `npx tsc -b` limpo.
```

#### 1c · Acoplamento no process-data

```
#file:SALDO_PROJETOS_IMPLEMENTACAO.md #file:scripts/preprocessCsv.mjs #file:src/lib/saldoProjetosCore.ts

Adicione a etapa "saldo de projetos" ao FINAL de scripts/preprocessCsv.mjs, conforme a seção 4.

1. Localize a variável com o retorno de parseCsvCarteira e reaproveite o .projetos dela. Não recalcule nada.
2. Imports novos: buildSaldoProjetosSection e, de node:fs, só o que faltar (existsSync, unlinkSync).
3. Depois da ÚLTIMA escrita existente, insira um bloco isolado
   `// ── Saldo de projetos (opcional, aditivo) ──` que:
   - usa public/data/Saldo_Projetos.csv → public/data/saldo-projetos.json (mesmo diretório base do script);
   - CSV ausente → remove o JSON antigo se existir, console.info e segue;
   - presente → try: section = buildSaldoProjetosSection({ csv, projetos, generatedAt: new Date().toISOString() });
     grava o JSON; loga linhas, exerciseYear, dataReferencia e totals.saldoPotencial;
     se !section.reconciliation.ok → console.warn com checks, yearGuard e as 5 primeiras identityErrors.
     catch: remove o JSON se existir e console.warn("[saldo-projetos] ignorado:", e.message).
   - nunca chama process.exit nem relança.
4. Em scripts/atualizar-dados-bi.ps1, adicione "saldo projetos/saldo_projetos.dax" → "public/data/Saldo_Projetos.csv"
   à lista de consultas, seguindo exatamente o formato das entradas existentes.

Restrições: nenhuma linha existente alterada fora dos imports e da lista do .ps1. Ordem das etapas atuais preservada.
Aceite: sem o CSV, `npm run process-data` termina com exit 0 e carteira-processed.json igual
(`node scripts/carteira-baseline.mjs check` imprime OK); com o CSV real, saldo-projetos.json gerado e reconciliação no log.
Não altere scripts/carteira-baseline.mjs.
```

### Prompt Copilot 2 — Widget de saldo potencial

#### 2a · Lógica pura + hook

```
#file:SALDO_PROJETOS_IMPLEMENTACAO.md #file:src/features/radar/types.ts #file:src/features/saldo/saldoConfig.ts #file:src/lib/dataSource.ts

Crie src/features/saldo/saldo.ts, useSaldoProjetos.ts e saldo.test.ts conforme as seções 5.2, 5.3 e 7.

saldo.ts:
- Assinaturas exatamente como na seção 5.2. Funções puras, sem React, sem new Date() para "hoje".
- Agregações são SOMAS das linhas. saldoPotencial NUNCA é recalculado (armadilha A4).
- aggregateSaldoBy("projeto"): label = nomeLB, aprovador = primeiro não nulo, ultimaDataCompromisso = maior data.
  aggregateSaldoBy("rubrica"): aprovador = null.
- classifySaldo segue a tabela de precedência da seção 5.2 com SALDO_SIGNAL_TOLERANCE.
- pctCaixa/pctSaldo = null quando orcamento === 0.
- mesesDesde: diferença em meses inteiros (calendário) entre a data e dataReferencia.

useSaldoProjetos.ts: estados da seção 5.3; fetch `${import.meta.env.BASE_URL}data/saldo-projetos.json`,
cache "no-store"; 404 → "unavailable"; outro erro ou schemaVersion !== 1 → "error"; promise em cache de módulo.

saldo.test.ts: os 6 casos da seção 7. Não modifique nenhum arquivo existente.
Aceite: `npx vitest run src/features/saldo` verde, `npx tsc -b` limpo.
```

#### 2b · Componente `SaldoPotencialCard`

```
#file:SALDO_PROJETOS_IMPLEMENTACAO.md #file:src/features/saldo/saldo.ts #file:src/features/saldo/useSaldoProjetos.ts #file:src/features/radar/CashRiskBanner.tsx #file:src/lib/format.ts

Crie src/features/saldo/SaldoPotencialCard.tsx conforme a seção 5.4 (props, estados, layout).

- Padrão visual de CashRiskBanner.tsx: Card/Button de components/ui/primitives, tokens Tailwind existentes,
  skeleton animate-pulse. Nenhuma cor hex, nenhuma lib nova.
- Escopo: filterSaldoLinhas({ projectKeys }) → summarizeSaldo e aggregateSaldoBy("projeto").
- Número principal: totals.saldoPotencial. Subtexto: % de orcamento e projetosComSaldo.
- Barra 100% Caixa | Compromisso válido | Saldo disponível sobre o orçamento, com role="img" e aria-label com os valores.
- Nota de premissa (legado) SÓ em "full", em text-text-muted e sem ícone de alerta, quando
  compromissoLegado >= SALDO_LEGADO_MATERIAL: "Premissa: R$ X em compromissos de RCs anteriores a <exercício> desconsiderados".
- "full": topBySaldoPotencial(topN) com nome · aprovador · valor · "último compromisso há N meses"
  (mesesDesde com section.dataReferencia) ou "sem compromisso aprovado em <exercício>".
- reconciliation.ok === false → aviso no lugar dos números, com o motivo e botão para onOpenDetail.
- Default de onOpenDetail: navigate("/risco-caixa"). useMemo nos agregados.

Montagem na home, SEM editar HomeExecutive.tsx: no componente que renderiza <CashRiskBanner />, logo abaixo:
{import.meta.env.VITE_FEATURE_SALDO_PROJETOS === "true" && <SaldoPotencialCard variant="compact" projectKeys={...} />}
usando a lista já filtrada disponível ali (new Set(lista.map(p => p.id))).
Declare VITE_FEATURE_SALDO_PROJETOS em ImportMetaEnv (src/vite-env.d.ts) se ainda não houver.

Aceite: flag off → home idêntica; flag on sem JSON → nada aparece; com o JSON → valor igual a totals.saldoPotencial.
```

### Prompt Copilot 3 — Tela de Risco de Caixa & Rubricas

#### 3a · Página e subcomponentes

```
#file:SALDO_PROJETOS_IMPLEMENTACAO.md #file:src/features/saldo/saldo.ts #file:src/features/saldo/useSaldoProjetos.ts #file:src/features/saldo/SaldoPotencialCard.tsx #file:src/features/radar/RadarPage.tsx #file:src/lib/tableSorting.ts

Crie em src/features/saldo/: RiscoCaixaPage.tsx, SaldoBridge.tsx, RubricaRiskPanel.tsx,
ProjetoSaldoTable.tsx e SaldoAuditPanel.tsx, conforme a seção 5.5.

RiscoCaixaPage:
- useSaldoProjetos() + usePortfolioData() (só leitura), como em RadarPage.tsx.
- Header: Voltar (navigate("/")), exercício, "referência BI dd/mm" (section.dataReferencia) e badge de reconciliação.
- Filtros locais: Programa (n4Curta via projectKey → ProjetoBase), Rubrica multi, Aprovador, busca.
  Viram filterSaldoLinhas; o Set de projectKeys resultante alimenta o <SaldoPotencialCard variant="full" />.
- Estados: loading (SkeletonList), unavailable, error, reconciliation.ok=false (ponte e widget viram aviso; o resto continua).

SaldoBridge: props { totals: SaldoTotals }. Renderiza buildSaldoBridge como tabela/cascata vertical com %
sobre o orçamento e, abaixo, uma linha neutra de premissa para compromissoLegado
("desconsiderado por premissa: RC aprovada antes de <exercício>"), fora da ponte e sem tom de alerta.
RubricaRiskPanel: props { views: SaldoRecorteView[]; selected: string[]; onToggle(r: string): void }.
ProjetoSaldoTable: props { views: SaldoRecorteView[]; linhasPorProjeto: Map<string, SaldoProjetoLinha[]>;
  meta: Map<string, { n4Curta: string }>; dataReferencia: string }. Colunas da seção 5.5, tableSorting.ts,
  ordem padrão saldoPotencial desc; a linha expande as rubricas inline; sem modal.
SaldoAuditPanel: fechado por padrão; mostra yearGuard, checks, warnings, identityErrors, órfãos e o
  top 10 |saldoDisponivel oficial − derivado|, com derivado = orcamento2026 − realizado2026 − emPagamento2026 − compromisso
  do ProjetoBase, calculado AQUI (sem importar executive.ts), e a nota de que a diferença esperada ≈ compromisso legado.

Restrições: nenhum arquivo existente alterado. Só tokens e primitivas existentes. Formatação via format.ts.
Aceite: `npx tsc -b` limpo. A página renderiza com o saldo-projetos.json real e com o arquivo ausente.
```

#### 3b · Rota e navegação

```
#file:SALDO_PROJETOS_IMPLEMENTACAO.md #file:src/lib/simpleRouter.ts

Conecte /risco-caixa conforme a seção 5.6, com alteração mínima.

1. Localize o componente que usa useCurrentPath() para renderizar RadarPage em "/radar".
2. Adicione: const RiscoCaixaPage = lazy(() => import("./features/saldo/RiscoCaixaPage").then(m => ({ default: m.RiscoCaixaPage })));
   e um ramo `path === "/risco-caixa"` → <Suspense fallback={<SkeletonList />}><RiscoCaixaPage /></Suspense>,
   antes do ramo padrão, sem alterar os ramos existentes.
3. Ao lado do botão/link que chama navigate("/radar"), adicione "Risco de Caixa" → navigate("/risco-caixa"),
   com o mesmo estilo, só quando import.meta.env.VITE_FEATURE_SALDO_PROJETOS === "true".

Restrições: não altere simpleRouter.ts, vercel.json nem os ramos "/" e "/radar". O diff só tem linhas adicionadas.
Aceite: `npm run verify` verde; /risco-caixa abre por URL direta em `npm run preview`; "/" e "/radar" sem diferença com a flag off.
```

---

### Prompt Copilot 4 — Saldo parado da home com o critério do BI

#### 4a · Adaptador + campo opcional nos insights

```
#file:SALDO_PROJETOS_IMPLEMENTACAO.md #file:src/features/radar/executive.ts #file:src/features/radar/executive.test.ts #file:src/features/saldo/saldo.ts #file:src/features/saldo/saldoConfig.ts

Implemente a seção 5.7, partes "Adaptador novo" e "Extensão de executive.ts".

1. Crie src/features/saldo/saldoBalances.ts com buildProjectBalancesFromSaldo(section, lista),
   exatamente conforme a tabela de regras da seção 5.7. Importe o TIPO ProjectBalance de ../radar/executive.
   Função pura; use section.dataReferencia (não new Date()) para daysSinceMovement.
2. Em src/features/radar/executive.ts, faça SÓ isto:
   - adicione `saldoParadoCriterio?: string` em BuildInsightsInput;
   - no insight de target 'saldo', troque o trecho fixo "sem movimentação há mais de 60 dias" por
     `${saldoParadoCriterio ?? "sem movimentação há mais de 60 dias"}`.
   Nenhuma outra linha de executive.ts muda.
3. Crie src/features/saldo/saldoBalances.test.ts com os 7 casos da seção 7.
4. ACRESCENTE no FIM de executive.test.ts um único teste novo para saldoParadoCriterio (seção 7).
   Não edite nenhum teste existente.

Aceite: `npm run verify` verde. O diff de executive.ts tem no máximo 2 linhas alteradas/adicionadas.
```

#### 4b · Troca de fonte na home (flag)

```
#file:SALDO_PROJETOS_IMPLEMENTACAO.md #file:src/features/radar/HomeExecutive.tsx #file:src/features/saldo/saldoBalances.ts #file:src/features/saldo/useSaldoProjetos.ts #file:src/features/saldo/saldoConfig.ts

Implemente a seção 5.7, parte "Troca em HomeExecutive", em src/features/radar/HomeExecutive.tsx.

1. Chame useSaldoProjetos() no topo do componente (junto de useCuration).
2. Dentro do useMemo existente, sem remover nada:
   - mantenha projectBalances/balanceSummary atuais;
   - calcule fonteBI = import.meta.env.VITE_SALDO_PARADO_FONTE_BI === "true" && saldo.status === "ready" && saldo.section.reconciliation.ok;
   - balancesExibicao = fonteBI ? buildProjectBalancesFromSaldo(saldo.section, lista) : projectBalances;
   - summaryExibicao = summarizeBalances(balancesExibicao);
   - buildBridge continua recebendo balanceSummary.liquido (NÃO trocar);
   - buildInsights recebe saldoParadoValue = (fonteBI || bundle.projectActivity) ? summaryExibicao.parado.value : 0
     e saldoParadoCriterio = fonteBI ? SALDO_PARADO_CRITERIO_BI : undefined;
   - retorne também balancesExibicao, summaryExibicao e fonteBI; inclua o estado do saldo nas deps.
3. No JSX, troque projectBalances/balanceSummary por balancesExibicao/summaryExibicao SOMENTE em:
   card "Saldo remanejável", painel "balances" (abas, tabela, total, getFilteredBalances, exportCsv) e rodapé "Saldo parado".
   semAtividade passa a ser `!fonteBI && !bundle.projectActivity`.
4. Aplique os textos condicionais da tabela "Textos dependentes da fonte" da seção 5.7
   (contexto do card, descrições das abas Parados/Ativos, cabeçalho "Comp. válido"; o mesmo cabeçalho no exportCsv quando fonteBI).
5. Declare VITE_SALDO_PARADO_FONTE_BI em ImportMetaEnv (src/vite-env.d.ts).

Restrições: não altere layout, classes, ordem dos blocos nem nenhum outro consumidor.
Com a flag desligada, a renderização tem de ser idêntica à atual.
Aceite: `npm run verify` verde. Flag off → home igual à atual. Flag on com JSON reconciliado →
card "Saldo remanejável" = Σ saldoPotencial dos projetos da lista filtrada.
Flag on com JSON ausente ou não reconciliado → cai no cálculo atual sem erro.
```

---

## 9. Decisões de negócio registradas (18/10/2026)

| # | Decisão | Efeito no desenho |
|---|---|---|
| 1 | A página "Saldo Projetos" do BI usa slicer Ano = 2026 | A consulta `saldo_projetos.dax` reproduz o contexto. A armadilha A3 está resolvida. |
| 2 | Compromissos de RCs aprovadas antes de 01/01 são desconsiderados de propósito (a área acredita que não vão se realizar) | O legado aparece como **premissa** neutra, não como alerta (seções 5.4 e 5.5). |
| 3 | O saldo parado da home passa ao critério do BI | Etapa P4 (seção 5.7), atrás de `VITE_SALDO_PARADO_FONTE_BI`. A ponte do caixa projetado continua no cálculo atual. |

**Ponto de atenção para a V2 (fora do escopo):** os compromissos legados desconsiderados existem como
RCs no Radar. Cruzar esse valor com as RCs que o gestor classificou como "Não ocorre"/"Legado" na
curadoria validaria a premissa da decisão 2 com dado, em vez de crença.
