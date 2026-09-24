# Radar de Risco de Caixa — Pacote de Implementação

> **Projeto:** `capex-dashboard-react`
> **Tipo:** nova capacidade (rota `/radar`) sobre o dashboard existente
> **Status:** arquitetura aprovada — pronto para implementação
> **Data:** 24/09/2026

Este documento é a especificação executável do Radar. Mantenha-o aberto no VS Code e
referencie-o com `@workspace` ou `#file:RADAR_IMPLEMENTACAO.md` ao usar o GitHub Copilot.
Os prompts da seção 9 assumem que este arquivo está no contexto.

---

## Sumário

1. [Decisões arquiteturais consolidadas](#0-decisões-arquiteturais-consolidadas)
2. [Modelo TypeScript](#1-modelo-typescript)
3. [Estrutura PostgreSQL](#2-estrutura-postgresql)
4. [Contratos REST](#3-contratos-rest)
5. [Pseudocódigo do process-data](#4-pseudocódigo-do-process-data)
6. [Pseudocódigo do merge](#5-pseudocódigo-do-merge)
7. [Wireframe final](#6-wireframe-final)
8. [User stories do MVP](#7-user-stories-do-mvp)
9. [Plano de implementação](#8-plano-de-implementação)
10. [Prompts para o GitHub Copilot](#9-prompts-para-o-github-copilot)

---

## 0. Decisões arquiteturais consolidadas

| Decisão | Valor |
|---|---|
| Fonte oficial | BI → DAX → `compromissos_detalhados.csv` → `process-data` → JSON |
| Pipeline atual | **não é alterado** |
| Chave de armazenamento | `RC:<REQ_COMPRA>\|OC:<ORDEM_DE_COMPRA>\|PPM:<IdPPM>` |
| Fallback sem OC | `OC:PENDING` |
| Unidade de edição | **RC** (com expansão opcional por chave) |
| Campos editáveis | `estimatedDeliveryDate`, `poStatus`, `notes` |
| Merge | em leitura, no cliente |
| Persistência | PostgreSQL serverless (Neon), 2 tabelas |
| API | Vercel Functions, 3 endpoints |

### Números de referência do CSV validado

Use estes valores nos testes de reconciliação. Vieram do export de 24/09/2026.

| Métrica | Valor |
|---|---:|
| Linhas no CSV | 866 |
| Chaves `RC+OC+PPM` | 806 |
| RCs distintas | 742 |
| Valor total | R$ 53.815.645,44 |
| Linhas sem OC (PENDING) | 102 |
| RCs integralmente PENDING | 75 |
| RCs heterogêneas (expansão sugerida) | 29 |
| Projetos distintos | 170 |
| Linhas sem `DATA_PROMETIDA` | 103 |
| Linhas com valor negativo | 1 (R$ −42.933,51) |
| RCs que cobrem 80% do valor | 80 |

### Regras de cálculo

```
expectedPaymentDate = estimatedDeliveryDate + PRAZO_PAGAMENTO_DIAS   // 30

BG_CURADO = Realizado + RI + Σ sourceValue
            onde poStatus = CONFIRMED  e  expectedPaymentDate <= 31/12/<exercicio>

CARRYOVER = Σ sourceValue
            onde poStatus = CONFIRMED  e  expectedPaymentDate >  31/12/<exercicio>
```

**Classificação exaustiva** — todo compromisso cai em exatamente um balde, e a soma
dos sete tem de bater com o total do BI:

| Balde | Condição | BG | Carryover |
|---|---|:--:|:--:|
| `CONFIRMED_IN_YEAR` | CONFIRMED + pagamento ≤ 31/12 | ✔ | — |
| `CARRYOVER` | CONFIRMED + pagamento > 31/12 | — | ✔ |
| `CONFIRMED_NO_DATE` | CONFIRMED sem data (bloqueado por constraint) | — | — |
| `AT_RISK` | AT_RISK | — | — |
| `NO_VISIBILITY` | NO_VISIBILITY | — | — |
| `CANCELLED` | CANCELLED | — | — |
| `NOT_CURATED` | sem curadoria | — | — |

> **Pendência aberta:** confirmar com o time do BI se `ValorCompromisso` é saldo aberto
> ou valor cheio, e se o RI inclui requisições que já viraram RC. Se houver sobreposição,
> o BG Curado infla. Não bloqueia a implementação; bloqueia a publicação do número.

---

## 1. Modelo TypeScript

Arquivo sugerido: `src/features/radar/types.ts`

```ts
// ─────────────────────────────────────────────────────────────
// Enums e constantes
// ─────────────────────────────────────────────────────────────

export const PO_STATUS = ['CONFIRMED', 'AT_RISK', 'CANCELLED', 'NO_VISIBILITY'] as const;
export type PoStatus = (typeof PO_STATUS)[number];

export type CurationLevel = 'RC' | 'KEY';

export type CashBucket =
  | 'CONFIRMED_IN_YEAR'
  | 'CARRYOVER'
  | 'CONFIRMED_NO_DATE'
  | 'AT_RISK'
  | 'NO_VISIBILITY'
  | 'CANCELLED'
  | 'NOT_CURATED';

export const PAYMENT_LEAD_DAYS = 30;
export const PENDING_OC = 'PENDING';

// ─────────────────────────────────────────────────────────────
// Fonte oficial — gerada pelo process-data, nunca editada
// ─────────────────────────────────────────────────────────────

/** Linha bruta do compromissos_detalhados.csv, preservada para auditoria. */
export interface CommitmentSourceLine {
  idPpm: string;
  nomeLb: string;
  rubrica: string;
  reqCompra: string;
  ordemCompra: string | null;
  fornecedor: string;
  comprador: string;
  statusCompromisso: string;
  statusRc: string;
  dataNecessidade: string | null;   // ISO yyyy-mm-dd
  dataPrometida: string | null;     // ISO yyyy-mm-dd
  valorCompromisso: number;
}

/** Compromisso consolidado no grão RC+OC+PPM. Unidade de ARMAZENAMENTO. */
export interface CommitmentSource {
  commitmentKey: string;            // RC:<rc>|OC:<oc|PENDING>|PPM:<ppm>
  rc: string;
  oc: string;                       // 'PENDING' quando ausente
  projectId: string;
  projectName: string;
  rubrica: string;
  supplier: string;
  systemStatus: string;
  systemPromisedDate: string | null;
  systemNeedDate: string | null;
  sourceValue: number;              // soma de ValorCompromisso (aceita negativo)
  lineCount: number;
  details: CommitmentSourceLine[];
}

/** Agrupamento por RC. Unidade de EDIÇÃO. */
export interface RcGroup {
  rc: string;
  commitmentKeys: string[];
  totalValue: number;
  projectIds: string[];
  suppliers: string[];
  ocs: string[];
  /** true quando a RC tem >1 PPM, >1 OC, >1 fornecedor, >1 status ou datas divergentes. */
  isHeterogeneous: boolean;
  heterogeneityReasons: string[];
  /** true quando as datas sistêmicas da RC cruzam 31/12 do exercício. */
  splitsExercise: boolean;
}

/** Payload completo produzido pelo process-data. */
export interface CommitmentSourceBundle {
  generatedAt: string;
  exerciseYear: number;
  commitments: CommitmentSource[];
  rcGroups: RcGroup[];
  discardedLines: number;
  totals: { value: number; lines: number; keys: number; rcs: number };
}

// ─────────────────────────────────────────────────────────────
// Curadoria — escrita pelos gestores
// ─────────────────────────────────────────────────────────────

export interface CommitmentCuration {
  commitmentKey: string;
  estimatedDeliveryDate: string | null;   // ISO yyyy-mm-dd
  poStatus: PoStatus;
  notes: string | null;
  sourceValueAtCuration: number | null;
  curationLevel: CurationLevel;           // 'RC' = herdada | 'KEY' = específica
  inheritedFromKey: string | null;        // chave PENDING de origem
  updatedBy: string;
  updatedAt: string;                      // ISO timestamp
}

export type CurationMap = Record<string, CommitmentCuration>;

// ─────────────────────────────────────────────────────────────
// Visão — resultado do merge, existe apenas em memória
// ─────────────────────────────────────────────────────────────

export interface CommitmentView extends CommitmentSource {
  curation: CommitmentCuration | null;
  expectedPaymentDate: string | null;
  bucket: CashBucket;
  isCurated: boolean;
  /** valor do BI mudou desde a curadoria */
  isStale: boolean;
  staleDelta: number | null;
  /** curadoria herdada de uma chave PENDING que virou OC */
  requiresReview: boolean;
}

export interface RcView extends RcGroup {
  commitments: CommitmentView[];
  /** curadoria efetiva da RC quando homogênea; null quando as filhas divergem */
  effectiveCuration: CommitmentCuration | null;
  hasMixedCuration: boolean;
  curatedValue: number;
  notCuratedValue: number;
  buckets: Record<CashBucket, number>;
}

export interface RadarSummary {
  exerciseYear: number;
  totalCommitment: number;
  bgCurated: number;
  carryover: number;
  notCurated: number;
  buckets: Record<CashBucket, number>;
  coverage: { curatedKeys: number; totalKeys: number; curatedValue: number; ratio: number };
  /** soma dos baldes bate com o total do BI */
  reconciles: boolean;
}

// ─────────────────────────────────────────────────────────────
// DTOs da API
// ─────────────────────────────────────────────────────────────

export interface CurationUpsertRequest {
  estimatedDeliveryDate: string | null;
  poStatus: PoStatus;
  notes: string | null;
  sourceValue: number;
}

export interface RcCurationUpsertRequest extends CurationUpsertRequest {
  /** chaves alvo com o sourceValue de cada uma, enviado pelo cliente */
  targets: Array<{ commitmentKey: string; sourceValue: number }>;
  /** false (padrão) preserva filhas com curationLevel = 'KEY' */
  overrideKeyLevel?: boolean;
}

export interface RcCurationUpsertResponse {
  rc: string;
  written: string[];
  preserved: string[];   // filhas com curadoria própria, não sobrescritas
}
```

---

## 2. Estrutura PostgreSQL

Arquivo sugerido: `db/migrations/001_radar_curation.sql`

```sql
-- ============================================================
-- Radar de Risco de Caixa — camada de curadoria
-- Nenhum dado oficial do BI é gravado aqui.
-- ============================================================

CREATE TABLE IF NOT EXISTS commitment_curation (
    commitment_key           text PRIMARY KEY,
    estimated_delivery_date  date,
    po_status                text        NOT NULL,
    notes                    text,

    -- valor do BI no momento da curadoria: detecta envelhecimento
    source_value_at_curation numeric(18,2),

    -- 'RC'  = gravada pela edição da RC (herdada)
    -- 'KEY' = curada individualmente na expansão (tem precedência)
    curation_level           text        NOT NULL DEFAULT 'RC',

    -- chave PENDING de origem, quando a curadoria foi herdada na transição para OC
    inherited_from_key       text,

    updated_by               text        NOT NULL,
    updated_at               timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT po_status_valido
        CHECK (po_status IN ('CONFIRMED','AT_RISK','CANCELLED','NO_VISIBILITY')),

    CONSTRAINT curation_level_valido
        CHECK (curation_level IN ('RC','KEY')),

    -- CONFIRMED sem data deixaria o compromisso fora de todos os baldes de caixa
    CONSTRAINT confirmed_exige_data
        CHECK (po_status <> 'CONFIRMED' OR estimated_delivery_date IS NOT NULL),

    CONSTRAINT notes_tamanho
        CHECK (notes IS NULL OR length(notes) <= 2000),

    CONSTRAINT chave_formato
        CHECK (commitment_key ~ '^RC:[^|]+\|OC:[^|]+\|PPM:[^|]+$')
);

-- Filtro por RC na edição em lote: RC: até o primeiro pipe.
CREATE INDEX IF NOT EXISTS idx_curation_rc
    ON commitment_curation (split_part(commitment_key, '|', 1));

CREATE INDEX IF NOT EXISTS idx_curation_status
    ON commitment_curation (po_status);


CREATE TABLE IF NOT EXISTS curation_audit (
    id              bigserial PRIMARY KEY,
    commitment_key  text        NOT NULL,
    action          text        NOT NULL,   -- 'RC_UPSERT' | 'KEY_UPSERT'
    payload         jsonb       NOT NULL,   -- estado gravado
    actor           text        NOT NULL,
    occurred_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_key
    ON curation_audit (commitment_key, occurred_at DESC);
```

**Notas de implementação**

- Sem FK para o BI: a curadoria precisa sobreviver a um compromisso que saiu do export.
  Órfãs são detectadas no merge, não no banco.
- Sem versionamento bitemporal. A `curation_audit` responde o histórico.
- Auditoria escrita pela API, na **mesma transação** do upsert. Sem trigger.
- A escrita em nível de RC é um `INSERT ... ON CONFLICT DO UPDATE` em lote, numa
  transação só, com `WHERE curation_level = 'RC'` quando `overrideKeyLevel` for falso.

---

## 3. Contratos REST

Base: `/api/curation`. Autenticação: a mesma já usada pelo `capex-dashboard-react`.

### `GET /api/curation`

Retorna todas as curadorias para o merge. Sem paginação — o volume é de centenas.

```jsonc
// 200 OK
{
  "data": {
    "RC:RCGRJ10639595|OC:OCGCP10665890|PPM:30783": {
      "commitmentKey": "RC:RCGRJ10639595|OC:OCGCP10665890|PPM:30783",
      "estimatedDeliveryDate": "2026-11-15",
      "poStatus": "CONFIRMED",
      "notes": "Fornecedor confirmou embarque",
      "sourceValueAtCuration": 24344.90,
      "curationLevel": "RC",
      "inheritedFromKey": null,
      "updatedBy": "gestor@g.globo",
      "updatedAt": "2026-09-22T09:15:00Z"
    }
  },
  "meta": { "count": 218, "generatedAt": "2026-09-24T19:00:00Z" }
}
```

> Objeto indexado pela chave, **não array** — o merge vira `curation[key]`, sem loop.

### `PUT /api/curation/rc/:rc`

Edição em nível de RC. Propaga para todas as chaves informadas em `targets`.

```jsonc
// request
{
  "estimatedDeliveryDate": "2026-11-15",
  "poStatus": "CONFIRMED",
  "notes": "Fornecedor confirmou embarque",
  "sourceValue": 0,
  "targets": [
    { "commitmentKey": "RC:RCGRJ10624185|OC:OCGCP10702977|PPM:30783", "sourceValue": 1500000.00 },
    { "commitmentKey": "RC:RCGRJ10624185|OC:OCGCP10702977|PPM:30791", "sourceValue": 1053538.31 }
  ],
  "overrideKeyLevel": false
}

// 200 OK
{ "rc": "RCGRJ10624185", "written": ["RC:...|PPM:30783"], "preserved": ["RC:...|PPM:30791"] }
```

- Cada chave é gravada com `curation_level = 'RC'` e o `sourceValue` **daquela chave**.
- `preserved` lista as filhas com `curation_level = 'KEY'` que não foram tocadas.
  A UI mostra isso ao gestor.
- Tudo numa transação: ou grava todas, ou nenhuma.

| Código | Situação |
|---|---|
| `200` | gravado |
| `400` | CONFIRMED sem data, status inválido, chave fora do padrão, `targets` vazio |
| `401` | não autenticado |

### `PUT /api/curation/key/:commitmentKey`

Curadoria individual, usada apenas na expansão de RCs heterogêneas.
Grava com `curation_level = 'KEY'`, que passa a ter precedência sobre edições da RC.

```jsonc
// request
{
  "estimatedDeliveryDate": "2027-01-20",
  "poStatus": "CONFIRMED",
  "notes": "Entrega parcial adiada",
  "sourceValue": 1053538.31
}
// 200 OK | 201 Created | 400 | 401
```

> **Três endpoints, nenhum a mais no MVP.** Sem `DELETE`: curadoria não se apaga,
> muda-se o status. Sem `GET /history`: a auditoria fica no banco, sem tela.
> Sem controle de concorrência: last-write-wins é aceitável neste volume.

---

## 4. Pseudocódigo do process-data

Função nova. **Nenhuma função existente é alterada.**
Arquivo sugerido: `process-data/consolidateCommitments.(ts|js)`

```
função consolidarCompromissos(linhasCsv, exercicio):

    mapaChaves = {}
    descartadas = 0

    // ── Passo 1: consolidar no grão RC + OC + PPM ──────────────
    para cada linha em linhasCsv:
        rc  = trim(linha.REQ_COMPRA)
        oc  = trim(linha.ORDEM_DE_COMPRA) ou "PENDING"
        ppm = trim(linha.IdPPM)

        se rc vazio ou ppm vazio:
            descartadas += 1
            continuar

        chave = "RC:" + rc + "|OC:" + oc + "|PPM:" + ppm

        se chave não existe em mapaChaves:
            mapaChaves[chave] = {
                commitmentKey: chave, rc, oc, projectId: ppm,
                projectName:   linha.NomeLB,
                rubrica:       linha.Rubrica,
                supplier:      linha.FORNECEDOR,
                systemStatus:  linha.STATUS_COMPROMISSO,
                sourceValue: 0, lineCount: 0,
                systemPromisedDate: nulo, systemNeedDate: nulo,
                details: []
            }

        reg = mapaChaves[chave]
        reg.sourceValue += parseDecimalPtBr(linha.ValorCompromisso)   // aceita negativo
        reg.lineCount   += 1
        reg.details.anexar(normalizarLinha(linha))

        // maior data válida vence
        dp = parseData(linha.DATA_PROMETIDA)
        se dp válida e (reg.systemPromisedDate nula ou dp > reg.systemPromisedDate):
            reg.systemPromisedDate = dp
        // idem para systemNeedDate com DATA_NECESSIDADE

    commitments = valores(mapaChaves)

    // ── Passo 2: agrupar por RC (unidade de edição) ────────────
    rcGroups = []
    para cada rc, itens em agruparPor(commitments, "rc"):

        ppms       = distintos(itens.projectId)
        ocs        = distintos(itens.oc)
        suppliers  = distintos(itens.supplier)
        status     = distintos(itens.systemStatus)
        datas      = distintos(itens.systemPromisedDate, ignorando nulos)

        razoes = []
        se tamanho(ppms)      > 1: razoes.anexar("multiplos_projetos")
        se tamanho(ocs)       > 1: razoes.anexar("multiplas_ocs")
        se tamanho(suppliers) > 1: razoes.anexar("multiplos_fornecedores")
        se tamanho(status)    > 1: razoes.anexar("status_divergente")
        se tamanho(datas)     > 1: razoes.anexar("datas_divergentes")

        // a RC divide o exercício quando as datas sistêmicas caem dos dois lados
        corte      = 31/12/exercicio
        pagamentos = datas.mapear(d => d + PAYMENT_LEAD_DAYS)
        divide     = pagamentos.algum(p => p <= corte) e pagamentos.algum(p => p > corte)
        se divide: razoes.anexar("divide_exercicio")

        rcGroups.anexar({
            rc, commitmentKeys: itens.commitmentKey,
            totalValue: soma(itens.sourceValue),
            projectIds: ppms, suppliers, ocs,
            isHeterogeneous: tamanho(razoes) > 0,
            heterogeneityReasons: razoes,
            splitsExercise: divide
        })

    // ── Passo 3: reconciliação obrigatória ─────────────────────
    afirmar soma(commitments.sourceValue) == soma(linhasCsv.ValorCompromisso)  // ±0,01
    afirmar soma(commitments.lineCount)   == tamanho(linhasCsv) − descartadas

    retornar {
        generatedAt: agora(), exerciseYear: exercicio,
        commitments, rcGroups, discardedLines: descartadas,
        totals: { value, lines, keys: tamanho(commitments), rcs: tamanho(rcGroups) }
    }
```

**Cuidados**

| Item | Regra |
|---|---|
| `parseDecimalPtBr` | milhar `.`, decimal `,` — o CSV traz `24344,9`. Negativos são válidos. |
| `parseData` | formato `AAAA-MM-DD hh:mm:ss,SSS`. Vazio é ausência, não erro (103 linhas). |
| Saída | array novo no JSON, ao lado do que já existe. Nenhum campo atual muda. |

---

## 5. Pseudocódigo do merge

Roda no cliente, a cada carga. Arquivo sugerido: `src/features/radar/merge.ts`

```
função mergearRadar(bundle, curationMap, exercicio):

    corte = 31/12/exercicio
    views = []

    // ── Passo 1: uma CommitmentView por chave ──────────────────
    para cada c em bundle.commitments:

        cur = curationMap[c.commitmentKey] ou nulo

        // herança PENDING → OC: a chave virou OC mas só há curadoria do PENDING
        requiresReview = falso
        se cur nulo e c.oc != "PENDING":
            chavePendente = "RC:" + c.rc + "|OC:PENDING|PPM:" + c.projectId
            se curationMap[chavePendente] existe:
                cur = copiar(curationMap[chavePendente])
                cur.inheritedFromKey = chavePendente
                requiresReview = verdadeiro      // sugestão, não curadoria confirmada

        pagamento = cur?.estimatedDeliveryDate
                    ? cur.estimatedDeliveryDate + PAYMENT_LEAD_DAYS
                    : nulo

        bucket = classificar(cur, pagamento, corte)

        stale = cur?.sourceValueAtCuration != nulo
                e |c.sourceValue − cur.sourceValueAtCuration| > 0,01

        views.anexar({ ...c, curation: cur,
                       expectedPaymentDate: pagamento, bucket,
                       isCurated: cur != nulo e não requiresReview,
                       isStale: stale,
                       staleDelta: stale ? c.sourceValue − cur.sourceValueAtCuration : nulo,
                       requiresReview })

    // ── Passo 2: uma RcView por RC ─────────────────────────────
    rcViews = []
    para cada g em bundle.rcGroups:
        filhas = views.filtrar(v => v.rc == g.rc)

        // curadoria efetiva: só quando todas as filhas concordam
        assinaturas = distintos(filhas.mapear(assinaturaDaCuradoria))
        mixed       = tamanho(assinaturas) > 1
        efetiva     = mixed ? nulo : filhas[0].curation

        rcViews.anexar({ ...g, commitments: filhas,
                         effectiveCuration: efetiva, hasMixedCuration: mixed,
                         curatedValue:    soma(filhas onde isCurated, sourceValue),
                         notCuratedValue: soma(filhas onde não isCurated, sourceValue),
                         buckets: somarPorBalde(filhas) })

    // ── Passo 3: resumo ────────────────────────────────────────
    baldes = somarPorBalde(views)
    resumo = {
        exerciseYear: exercicio,
        totalCommitment: soma(views.sourceValue),
        bgCurated:  baldes.CONFIRMED_IN_YEAR,    // + Realizado + RI, vindos do BI
        carryover:  baldes.CARRYOVER,
        notCurated: baldes.NOT_CURATED,
        baldes,
        coverage: { curatedKeys, totalKeys, curatedValue, ratio },
        reconciles: |soma(todos os baldes) − totalCommitment| <= 0,01
    }

    retornar { views, rcViews, resumo }


função classificar(cur, pagamento, corte):
    se cur nulo:                          retornar "NOT_CURATED"
    se cur.poStatus == "CANCELLED":       retornar "CANCELLED"
    se cur.poStatus == "AT_RISK":         retornar "AT_RISK"
    se cur.poStatus == "NO_VISIBILITY":   retornar "NO_VISIBILITY"
    se pagamento nulo:                    retornar "CONFIRMED_NO_DATE"
    se pagamento <= corte:                retornar "CONFIRMED_IN_YEAR"
    retornar "CARRYOVER"
```

> `reconciles` é a trava de confiança: se a soma dos baldes não bater com o total do BI,
> a tela deve mostrar o aviso em vez dos KPIs. Um número errado vale menos que nenhum número.

---

## 6. Wireframe final

### Faixa no dashboard principal

```
╔══════════════════════════════════════════════════════════════════════════╗
║  RISCO DE CAIXA                                       Exercício 2026     ║
║                                                                          ║
║   BG Sistêmico   BG Curado    Gap          Carryover 27   Cobertura     ║
║   R$ 21,4 mi     R$ 18,9 mi   −R$ 2,5 mi   R$ 4,1 mi      68%          ║
║                               ▼ 11,7%                     156/230      ║
║                                                     [Abrir Radar »]     ║
╚══════════════════════════════════════════════════════════════════════════╝
```

### Rota `/radar`

```
╔══════════════════════════════════════════════════════════════════════════╗
║  RADAR DE RISCO DE CAIXA                          Dados BI: 24/09 08:00 ║
║                                                                          ║
║   BG Curado         Carryover 2027      Não curado                      ║
║   R$ 18,9 mi        R$ 4,1 mi           R$ 2,3 mi   (74 RCs)      ⚠     ║
║                                                                          ║
║   ✓ Soma dos baldes confere com o BI                                    ║
╠══════════════════════════════════════════════════════════════════════════╣
║  [Projeto ▾]  [Fornecedor ▾]  [☑ só não curados]              [🔍    ]  ║
║                                                                          ║
║  RC              Valor       Entrega      Pagto      Status      Nota   ║
║  ─────────────   ─────────   ──────────   ────────   ─────────   ────   ║
║  RCGRJ10639595     24.345   [15/11/26]   15/12/26   [CONFIRM ▾] [    ]  ║
║  RCGRJ10624185  2.553.538   [20/01/27]   19/02/27   [CONFIRM ▾] [    ]  ║
║   ⌄ 2 projetos · 1 OC                     ↳ carryover 2027              ║
║  RCGRJ10538780      6.099   [        ]       —      [—        ▾] [    ] ║
║  RCGSP10072044    606.344   [10/10/26]   09/11/26   [CONFIRM ▾] [obs.] ║
║   ⌄ 4 fornecedores                ⚠ valor mudou: 580.000 → 606.344     ║
║      [revisar]                                                          ║
║  RCGRJ10693073    641.430   [        ]       —      [—        ▾] [    ] ║
║   ⌄ PENDING · 2 projetos                                                ║
╚══════════════════════════════════════════════════════════════════════════╝
```

### Linha expandida (RC heterogênea)

```
║  RCGRJ10624185  2.553.538   [20/01/27]   19/02/27   [CONFIRM ▾] [    ]  ║
║  ⌃ 2 projetos · 1 OC                                                    ║
║    ┌────────────────────────────────────────────────────────────────┐   ║
║    │ PPM 30783   1.500.000  [20/01/27]  [CONFIRM ▾]  herdada da RC │   ║
║    │ PPM 30791   1.053.538  [05/03/27]  [CONFIRM ▾]  própria    ●  │   ║
║    │                                                                │   ║
║    │ ● curadoria própria: não é alterada ao editar a RC            │   ║
║    └────────────────────────────────────────────────────────────────┘   ║
```

### Regras de interação — o que decide a adoção

| Regra | Razão |
|---|---|
| Edição **inline**, sem modal | Modal custa dois cliques por linha |
| Salva no `blur`, indicador discreto | O gestor não deve pensar em persistência |
| Data com **máscara**, sem datepicker | Datepicker custa 3–5 s por linha |
| Status pela **primeira letra**: `C` `A` `N` `X` | Mantém a mão no teclado |
| `Tab` → `Enter` salva e pula para a próxima RC | Preenchimento em série |
| Nota por último no *tab order* | Nunca bloqueia o fluxo |
| `Pagto` calculado, **read-only** | Reforça que é derivado |
| CONFIRMED sem data → foco automático na data | Implementa a constraint antes do erro |
| Filtro "só não curados" **ligado por padrão** | Abre no que falta fazer |
| Expansão `⌄` só em RC heterogênea | 29 de 742 — não polui o resto |
| `⚠ valor mudou` com ação de revisão | É a resposta ao problema da planilha |

> **Orçamento de tempo por linha: 10 segundos.**
> Digitar data ~4 s · `Tab` · tecla de status ~2 s · `Enter` ~1 s.
> Se o gestor precisar tirar a mão do teclado, o design falhou.

---

## 7. User stories do MVP

### US-01 — Ver compromissos por RC

> Como gestor, quero ver os compromissos do meu portfólio agrupados por RC,
> para reconhecer as compras que eu mesmo abri.

**Critérios de aceite**
- A lista mostra uma linha por RC, com valor consolidado das chaves filhas.
- Colunas: RC, valor, entrega, pagamento previsto, status, nota.
- O total da tela reconcilia com o total do BI (aviso visível quando não bate).
- RCs heterogêneas têm indicador de expansão com o motivo (`2 projetos`, `4 fornecedores`).

### US-02 — Curar uma RC em menos de 10 segundos

> Como gestor, quero informar entrega, status e observação sem sair do teclado,
> para curar dezenas de RCs numa sessão.

**Critérios de aceite**
- Data com máscara `dd/mm/aa`; sem datepicker obrigatório.
- Status selecionável pela primeira letra.
- `Tab` percorre entrega → status → nota; `Enter` salva e vai para a próxima RC.
- Salvamento em background, sem bloquear a linha nem exibir modal.
- Selecionar CONFIRMED sem data leva o foco ao campo de data.

### US-03 — Propagar a curadoria da RC para as chaves filhas

> Como sistema, quero gravar a curadoria da RC em todas as chaves `RC+OC+PPM`,
> para que a análise por projeto continue exata.

**Critérios de aceite**
- Um `PUT /api/curation/rc/:rc` grava N registros com `curation_level = 'RC'`.
- Cada chave recebe o `sourceValue` dela própria, não o total da RC.
- Filhas com `curation_level = 'KEY'` são preservadas e listadas em `preserved`.
- A UI informa quantas linhas foram preservadas.
- Tudo numa transação; auditoria gravada junto.

### US-04 — Expandir e curar individualmente

> Como gestor, quero abrir uma RC heterogênea e curar cada projeto separadamente,
> quando a entrega ou o fornecedor forem diferentes.

**Critérios de aceite**
- O `⌄` aparece apenas em RCs com `isHeterogeneous = true`.
- Cada filha mostra PPM, OC, fornecedor, valor e a curadoria vigente.
- Curadoria própria é marcada visualmente e gravada com `curation_level = 'KEY'`.
- Edições posteriores na RC não sobrescrevem as filhas com curadoria própria.

### US-05 — Ver o Radar consolidado

> Como gestor, quero ver quanto do compromisso vira caixa neste ano e quanto é carryover,
> para responder à diretoria sem montar planilha.

**Critérios de aceite**
- KPIs: BG Curado, Carryover, Não curado, com contagem de RCs pendentes.
- Os sete baldes somam o total do BI; divergência exibe aviso no lugar dos KPIs.
- A faixa do dashboard principal mostra BG Sistêmico, BG Curado, Gap, Carryover e Cobertura.

### US-06 — Saber quando a curadoria envelheceu

> Como gestor, quero ser avisado quando o valor do BI mudar depois da minha curadoria,
> para revisar apenas o que mudou.

**Critérios de aceite**
- Divergência entre `sourceValue` e `sourceValueAtCuration` marca a linha.
- O aviso mostra o valor anterior e o atual.
- Ação de revisão regrava a curadoria com o valor corrente.

### US-07 — Herdar curadoria quando o PENDING vira OC

> Como gestor, quero que a curadoria feita antes da OC seja sugerida na nova chave,
> para não recomeçar do zero quando a compra avança.

**Critérios de aceite**
- Chave com OC sem curadoria própria herda a da chave `OC:PENDING` do mesmo PPM.
- A herança é sugestão: `requiresReview = true` até o gestor salvar.
- A linha aparece destacada como "revisar".
- A curadoria da chave PENDING não é apagada.

---

## 8. Plano de implementação

Seis etapas. Cada uma entrega algo verificável e tem um prompt na seção 9.

| # | Etapa | Entrega | Depende de |
|---|---|---|---|
| **E1** | Tipos e contratos | `types.ts` completo, sem lógica | — |
| **E2** | `process-data` | `consolidateCommitments` + testes de reconciliação | E1 |
| **E3** | Banco e API | migration + 3 endpoints + auditoria | E1 |
| **E4** | Merge | `merge.ts` + testes dos 7 baldes | E1, E2 |
| **E5** | Tela do Radar | rota `/radar`, tabela editável, expansão | E3, E4 |
| **E6** | Faixa no dashboard | 5 KPIs no dashboard principal | E4, E5 |

**Ordem recomendada:** E1 → E2 → E4 → E3 → E5 → E6.
Fazer o merge (E4) antes da API permite validar todos os cálculos com curadoria
falsa em memória, antes de existir banco. É onde os erros de regra aparecem.

**Definition of done por etapa**

- E2: reconciliação exata com os números da seção 0 (806 chaves, R$ 53.815.645,44).
- E4: os sete baldes somam o total; cobertura de teste nos casos de borda
  (sem data, negativo, PENDING, herança, stale).
- E3: `PUT` em RC com filha `KEY` preserva a filha; auditoria registra cada escrita.
- E5: uma RC curada em ≤ 10 s, medido com cronômetro por um gestor real.

---

## 9. Prompts para o GitHub Copilot

Cole um por vez no Copilot Chat do VS Code. Todos assumem este arquivo em contexto.

### E1 — Tipos e contratos

```
#file:RADAR_IMPLEMENTACAO.md

Crie src/features/radar/types.ts com exatamente os tipos da seção 1 deste documento.

Requisitos:
- Copie as interfaces e enums sem renomear nada.
- Não adicione tipos que não estejam no documento.
- Não implemente nenhuma função.
- Use `as const` nos arrays de enum e derive os union types deles.
- Exporte as constantes PAYMENT_LEAD_DAYS = 30 e PENDING_OC = 'PENDING'.
- Adicione um JSDoc de uma linha em cada interface, explicando seu papel.

Ao final, liste os tipos criados e pare. Não crie nenhum outro arquivo.
```

### E2 — process-data

```
#file:RADAR_IMPLEMENTACAO.md

Implemente process-data/consolidateCommitments.ts seguindo o pseudocódigo da seção 4.

Contexto: o pipeline BI → DAX → CSV → process-data → JSON está em produção e NÃO pode
ser alterado. Esta é uma função nova, adicionada ao lado das existentes.

Requisitos:
- Assinatura: consolidarCompromissos(linhasCsv: RawCsvRow[], exercicio: number):
  CommitmentSourceBundle, usando os tipos de src/features/radar/types.ts.
- Chave: `RC:${rc}|OC:${oc}|PPM:${ppm}`, com oc = 'PENDING' quando vazio.
- parseDecimalPtBr: milhar '.', decimal ',', aceita negativo. Ex.: "24344,9" → 24344.9.
- parseData: formato "AAAA-MM-DD hh:mm:ss,SSS"; string vazia retorna null, não lança erro.
- systemPromisedDate e systemNeedDate: a MAIOR data válida do grupo.
- Descarte linhas sem REQ_COMPRA ou sem IdPPM e conte em discardedLines.
- Monte rcGroups com isHeterogeneous, heterogeneityReasons e splitsExercise conforme a seção 4.
- Ao final, lance erro se a soma consolidada divergir do CSV em mais de R$ 0,01.

Escreva também consolidateCommitments.test.ts cobrindo:
- reconciliação de valor e de linhas;
- linha sem OC vira chave PENDING;
- valor negativo é somado normalmente;
- RC com 2 PPMs gera 2 chaves e 1 rcGroup com isHeterogeneous = true;
- linha sem DATA_PROMETIDA não quebra o parse.

Não toque em nenhum arquivo existente do process-data.
```

### E3 — Banco e API

```
#file:RADAR_IMPLEMENTACAO.md

Implemente a persistência e a API do Radar conforme as seções 2 e 3.

1. db/migrations/001_radar_curation.sql — exatamente o SQL da seção 2, sem alterações.

2. Vercel Functions, com pg (driver serverless do Neon), SEM ORM:
   - api/curation/index.ts        → GET, objeto indexado por commitmentKey
   - api/curation/rc/[rc].ts      → PUT em lote
   - api/curation/key/[key].ts    → PUT individual

Regras obrigatórias:
- O PUT de RC grava todos os targets numa única transação. Se qualquer um falhar,
  nenhum é gravado.
- Cada target recebe o sourceValue DELE, nunca o total da RC.
- Com overrideKeyLevel = false (padrão), o UPDATE tem WHERE curation_level = 'RC';
  as chaves não afetadas voltam em "preserved".
- Toda escrita insere uma linha em curation_audit na MESMA transação.
- Valide antes de gravar: poStatus no enum, CONFIRMED exige estimatedDeliveryDate,
  formato da chave. Erro de validação → 400 com mensagem clara.
- Sem controle de concorrência e sem DELETE.
- Autenticação: reutilize o middleware já usado pelo capex-dashboard-react.

Escreva testes de integração para: PUT de RC com 2 targets; PUT de RC com 1 filha
já em curation_level='KEY' (deve preservar); CONFIRMED sem data (deve retornar 400).
```

### E4 — Merge

```
#file:RADAR_IMPLEMENTACAO.md

Implemente src/features/radar/merge.ts seguindo o pseudocódigo da seção 5.

Requisitos:
- mergearRadar(bundle: CommitmentSourceBundle, curationMap: CurationMap,
  exercicio: number) retornando { views, rcViews, resumo }.
- Função pura, sem I/O e sem dependência de React.
- classificar() implementa exatamente a ordem de precedência da seção 5.
- expectedPaymentDate = estimatedDeliveryDate + PAYMENT_LEAD_DAYS.
- Herança PENDING → OC: chave com OC e sem curadoria própria herda a curadoria da
  chave `RC:<rc>|OC:PENDING|PPM:<ppm>`, marcando requiresReview = true e
  inheritedFromKey. A herança NÃO conta como isCurated.
- isStale quando |sourceValue − sourceValueAtCuration| > 0,01.
- effectiveCuration só é preenchida quando todas as filhas têm curadoria idêntica;
  caso contrário hasMixedCuration = true.
- resumo.reconciles compara a soma dos 7 baldes com totalCommitment, tolerância 0,01.

Escreva merge.test.ts com um caso para CADA balde da tabela da seção 0, mais:
- herança PENDING → OC marca requiresReview e não conta como curada;
- curadoria stale é detectada;
- RC com filhas divergentes retorna hasMixedCuration = true;
- reconciles = true num cenário com os 7 baldes preenchidos.
```

### E5 — Tela do Radar

```
#file:RADAR_IMPLEMENTACAO.md

Implemente a rota /radar no capex-dashboard-react, conforme a seção 6.

Estrutura:
- src/features/radar/RadarPage.tsx        — layout, KPIs, filtros
- src/features/radar/CommitmentTable.tsx  — tabela por RC, edição inline
- src/features/radar/RcRow.tsx            — linha da RC + expansão das filhas
- src/features/radar/useCuration.ts       — fetch do JSON + GET /api/curation + merge

REQUISITO DE ADOÇÃO — curar uma RC em menos de 10 segundos:
- Edição inline. Nenhum modal, em nenhuma hipótese.
- Data: input com máscara dd/mm/aa. Sem datepicker obrigatório.
- Status: <select> que aceita a primeira letra (C=CONFIRMED, A=AT_RISK,
  N=NO_VISIBILITY, X=CANCELLED).
- Tab percorre entrega → status → nota. Enter salva e move o foco para a próxima RC.
- Salvamento no blur, em background, com indicador discreto. Sem toast de sucesso.
- Selecionar CONFIRMED sem data move o foco para o campo de data.

Comportamento:
- Filtro "só não curados" ligado por padrão.
- Expansão ⌄ apenas quando isHeterogeneous; mostra o motivo ao lado.
- Na expansão, filhas com curationLevel='KEY' têm marcador visual e não são
  sobrescritas pela edição da RC — avise quantas foram preservadas após o PUT.
- Linha com isStale mostra "valor mudou: X → Y" e ação de revisão.
- Linha com requiresReview aparece destacada como "revisar".
- Se resumo.reconciles for false, exiba um aviso no lugar dos KPIs.

Use o design system já existente no projeto. Não introduza biblioteca de UI nova.
```

### E6 — Faixa no dashboard principal

```
#file:RADAR_IMPLEMENTACAO.md

Adicione a faixa de KPIs de risco de caixa ao dashboard principal, conforme a seção 6.

- Componente: src/features/radar/CashRiskBanner.tsx
- Cinco indicadores: BG Sistêmico, BG Curado, Gap (com variação %), Carryover, Cobertura.
- BG Sistêmico vem do JSON do BI; BG Curado e Carryover vêm do resumo do merge.
- Gap = BG Curado − BG Sistêmico, com sinal e cor.
- Cobertura mostra o percentual e a fração curadas/total.
- Botão "Abrir Radar" navega para /radar.
- Reaproveite o hook useCuration da etapa E5; não refaça o fetch.
- Se resumo.reconciles for false, mostre o aviso em vez dos valores.

Insira a faixa acima dos cards existentes, sem alterar nenhum componente atual.
```

---

## Pendências que não bloqueiam a implementação

| # | Pendência | Impacto |
|---|---|---|
| 1 | Confirmar se `ValorCompromisso` é saldo aberto ou valor cheio | Se for cheio, o BG conta duas vezes o que já foi pago |
| 2 | Confirmar se o RI inclui requisições que já viraram RC | Sobreposição infla o BG Curado |
| 3 | Confirmar estabilidade da chave entre dois exports | Chave instável gera curadoria órfã |
| 4 | Confirmar o mecanismo de autenticação atual do dashboard | Agora há escrita e identidade do curador |

As pendências 1 e 2 bloqueiam a **publicação do número**, não o desenvolvimento.
A 3 se resolve em cinco minutos quando houver um export de outra data.
A 4 precisa estar resolvida antes da etapa E3.
