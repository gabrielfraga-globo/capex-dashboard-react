# Fase 5c — Radar de Caixa: resumo executivo antes da tabela

**Status:** Concluído
**Arquivo Principal:** `src/features/radar/OperationalTable.tsx` e `src/features/radar/executive.ts`

## Resumo Executivo (Dados Atuais)
* **Impacto financeiro:** R$ 32,3M (22% do BG) — R$ 30,1M em risco + R$ 2,1M em 27
* **RCs impactadas:** 206 (199 em risco · 7 em 27) — 0 confirmadas
* **Onde trava (maior impacto):** E2 · Suprimentos (R$ 10,5M · 54 RCs) — 35% do impacto
* **Criticidade:** Crítico 6 (2%), Atenção 200 (52%), Normal 177 (46%)

## O que foi feito
1. **Cálculos (`executive.ts` / `executive.test.ts`)**
   - Criada a função `classifyCriticality(row, dataBase)` mapeando regras exatas (Crítico ≥ 1M, confirmadas vencidas, Atenção para as demais de Risco e C27 não confirmada).
   - Criada `buildRadarSummary` agrupando impacto, gargalo (`pctImpacto`), contagem de RCs e categorização por criticidade (Crítico, Atenção, Normal).

2. **Cards e Layout (`OperationalTable.tsx`)**
   - Adicionada faixa de 4 cards com visual neutro e cores restritas ao donut e pontos de atenção.
   - Botões interativos em cards 2, 3 e subitens do 4. O clique ativa o filtro na tabela, adicionando chip com botão de "limpar".
   - Nova coluna `Crit.` na tabela, com pontos coloridos centralizados, orientando a ordenação padrão.
   - Ajustes pontuais nos espaçamentos (`py-3`, `space-y-3` e `gap-3`) garantindo o encaixe 100% visível do cabeçalho da tabela em monitores de 1280×800 sem rolagem.

## Resultados dos Testes (`npm run verify`)
Todos os testes foram aprovados, incluindo os 6 novos cenários testando `classifyCriticality` e `buildRadarSummary`.
```
 ✓ process-data/consolidateCommitments.test.ts (6 tests)
 ✓ src/features/radar/stage.test.ts (18 tests)
 ✓ api/_lib/migration003.test.ts (1 test)
 ✓ src/features/radar/decision.test.ts (9 tests)
 ✓ api/_lib/curationColumns.test.ts (7 tests)
 ✓ src/features/radar/executive.test.ts (25 tests)
 ✓ src/features/radar/merge.test.ts (16 tests)
 ✓ src/features/radar/operational.test.ts (14 tests)
 ✓ src/features/radar/payment.test.ts (8 tests)
 ✓ api/curation/index.test.ts (1 test)
 ✓ api/curation/key/[key].test.ts (11 tests)
 ✓ api/curation/rc/[rc].test.ts (12 tests)

 Test Files  12 passed (12)
      Tests  128 passed (128)
```
