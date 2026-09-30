# Prompt — GitHub Copilot (Agent Mode) · Radar de Risco de Caixa V1

> Cole este prompt no Copilot Chat em **Agent Mode**, com o workspace `capex-dashboard-react` aberto.
> Anexe também `#file:RADAR_IMPLEMENTACAO.md` e `#file:README.md`.

---

## Papel

Você é um engenheiro sênior responsável por **evoluir** o projeto `capex-dashboard-react` para a V1 do Radar de Risco de Caixa.
O desenho funcional está **aprovado** (resumo na seção 6).
Você **não** vai reescrever o sistema. Vai evoluir o que existe, em incrementos pequenos, sem quebrar nada que funciona hoje.

## 0. Modo desta rodada: SOMENTE ANÁLISE E PLANO

**Nesta rodada, é proibido criar, editar, mover ou excluir qualquer arquivo.**
Também é proibido rodar comandos que alterem o repositório, o banco ou dependências (`npm install`, migrations, `git commit`, formatadores com escrita).
Comandos permitidos: leitura de arquivos, busca, `npm run build`, `npx tsc --noEmit`, `npm test` e scripts de validação somente leitura (ex.: `validarCarteira.mjs`), só para registrar o **estado atual (linha de base)**.

Ao final, entregue o documento descrito na seção 5 e **pare**. Só implemente depois que eu aprovar o plano explicitamente, fase por fase.

---

## 1. Antes de qualquer alteração (obrigatório)

1. **Ler toda a estrutura do projeto**: `src/`, `api/`, `db/migrations/`, `process-data/`, `scripts/`, `public/` (JSONs e CSVs), `src/DAX/`, `RADAR_IMPLEMENTACAO.md`, `README.md`, `manual_BI.txt`, `validarCarteira.mjs`, `vercel.json`, `package.json`, `.github/copilot-instructions.md`, `.github/agents/`.
2. **Mapear fluxos existentes** de ponta a ponta:
   - BI/DAX → CSV → `process-data/consolidateCommitments.ts` → JSON → `src/lib/dataSource.ts` / `csvProcessingCore.ts` → hooks → telas.
   - Curadoria: `useCuration` → `api/curation/*` → PostgreSQL (`commitment_curation`, `curation_audit`) → `merge.ts` → `CommitmentTable` / `RcRow`.
   - Radar Executivo: `RadarExecutivo.tsx`, `CashRiskBanner.tsx`, `RadarExecutivoPage.tsx`, `usePortfolioMetrics`, `metrics.ts`, `insights.ts`.
   - Auditoria Detalhada: `AuditoriaCarteiraPage.tsx`.
3. **Mapear dependências**: quem importa cada módulo de `src/features/radar/`, `src/lib/`, `src/hooks/`, `src/types/`; quais testes cobrem cada um.
4. **Inventariar**: componentes, hooks, types, enums, constantes (ex.: `PAYMENT_LEAD_DAYS`, `PO_STATUS`, `CashBucket`, `RADAR_CARD_BUCKETS`), funções de derivação (`derivarPoStatus`, `classificar`), contratos REST, schema SQL e constraints, formato de chave (`RC:<rc>|OC:<oc>|PPM:<ppm>`), e o shape de cada JSON/CSV consumido.
5. **Registrar a linha de base** (antes de qualquer mudança):
   - resultado de `npm run build`, `npx tsc --noEmit`, `npm test`;
   - totais produzidos hoje: total de compromisso, linhas, chaves, RCs, projetos, soma por balde (`CashBucket`), cobertura, valores dos cards do Radar Executivo e do banner.
6. **Gerar um diagnóstico de impacto** antes de propor qualquer mudança.

## 2. Princípios obrigatórios

- Não quebrar funcionalidades existentes.
- Não alterar regras já validadas sem justificativa escrita.
- Não remover campos usados atualmente (em types, JSON, API ou banco).
- Não alterar contratos de dados (CSV, JSON, REST, schema SQL) sem análise de impacto.
- Mudanças incrementais; cada fase entrega algo utilizável e reversível.
- Compatibilidade retroativa em primeiro lugar: dado antigo (curadorias já gravadas) precisa continuar sendo lido.
- **Manter a reconciliação atual**: a soma dos baldes continua batendo com o total do BI (`reconciles === true`).
- **Compatibilidade obrigatória** com o BI atual, o DAX atual, os JSONs atuais e o pipeline de processamento atual. Campos novos entram como **adição**, nunca como substituição.
- O pipeline oficial (`compromissos_detalhados.csv` → `process-data`) **não** é alterado nesta V1, exceto por adições compatíveis aprovadas.

## 3. Antes de implementar (obrigatório)

1. Comparar comportamento **atual × esperado** (seção 6), item a item.
2. Listar os **gaps**.
3. Listar os **riscos** (dados, regra de negócio, UX, performance, banco, deploy).
4. Propor **plano em fases** (seção 5).
5. Identificar **tudo que pode ser validado automaticamente** (testes unitários, testes de reconciliação, snapshot de totais, checagem de tipos, script de comparação antes/depois).

## 4. Regras de execução (valem para as rodadas seguintes)

**Validações obrigatórias ao fim de cada etapa:**

- [ ] `npm run build` sem erros.
- [ ] `npx tsc --noEmit` sem erros.
- [ ] `npm test` verde (nenhum teste existente removido ou afrouxado sem aprovação).
- [ ] Sem regressão visual nas telas existentes (descrever o que foi conferido em cada tela).
- [ ] Sem regressão funcional (filtros, ordenação, curadoria, expansão de RC, tema claro/escuro).
- [ ] Totais financeiros preservados (compromisso total, linhas, RCs, projetos).
- [ ] Reconciliação preservada (`reconciles === true`, soma dos baldes = total do BI).
- [ ] Tabela **antes × depois** de todos os indicadores afetados, com a explicação de cada diferença.

**Sempre que uma regra de negócio mudar**, documente:
1. a regra atual (com arquivo e linha);
2. a regra nova;
3. o impacto esperado (números e comportamento);
4. as telas afetadas.

**Para qualquer exclusão** (arquivo, função, campo, coluna, card):
1. justificativa;
2. dependências (quem importa/usa);
3. evidência de que não há uso ativo (busca no repositório, testes, API, banco).
Na dúvida, **deprecar** (manter e marcar) em vez de excluir.

**Se houver qualquer dúvida funcional**: não assuma. Registre a dúvida, proponha alternativas com prós e contras, e siga só com o que não depende dela.

---

## 5. Entregável desta rodada

Um único documento em Markdown, na resposta do chat (não grave em arquivo), com:

1. **Mapa do projeto**: estrutura, fluxos, dependências, contratos de dados (CSV, JSON, REST, SQL) e testes existentes.
2. **Linha de base**: build, tipos, testes e todos os totais e indicadores atuais (valores).
3. **Atual × esperado**: tabela por requisito da seção 6 (Existe / Parcial / Não existe), com arquivo de referência.
4. **Gaps**.
5. **Riscos** e mitigação.
6. **Dúvidas funcionais** em aberto, com alternativas.
7. **Plano em fases**. Sugestão de partida (ajuste com base na análise e justifique):
   - **Fase 1 — Derivação sem UI**: etapa operacional (E0–E8), sub-estados, responsável atual e dias na etapa como funções puras + testes. Nada muda na tela.
   - **Fase 2 — Em pagamento (E7)**: incorporar `Realizado_Pendente` no bundle como etapa, sem alterar o total de compromisso nem a reconciliação atual.
   - **Fase 3 — Decisão do gestor**: Previsão de caixa + Confiança + Próxima ação, com compatibilidade para curadorias já gravadas (`po_status` atual).
   - **Fase 4 — Tabela operacional**: novas colunas e contadores, status sistêmico no tooltip, layout fixo.
   - **Fase 5 — Radar Executivo**: novos cards, composição do BG, principal gargalo, estoque de orçamento (A Emitir).
   - **Fase 6 — Limpeza**: só o que foi comprovado sem uso, com aprovação.
8. **Lista de arquivos impactados por fase** (criar / alterar / deprecar), com o motivo.
9. **Sequência de implementação** (ordem de commits pequenos).
10. **Checklist de validações** por fase (seção 4) + validações automáticas propostas.
11. **Critérios de aceite** por fase, verificáveis.

---

## 6. Contexto funcional aprovado (V1)

### 6.1 Objetivo

O Radar deixa de ser uma tela de curadoria de compromissos e passa a ser uma ferramenta de **gestão da esteira** `Demanda → RC → OC → Entrega → NF → Pagamento → Caixa`.
Pergunta central: **qual valor está parado, em qual etapa, com quem, qual a próxima ação e se ainda pode virar caixa em 2026.**
Radar Executivo e Radar Operacional **permanecem**. A Auditoria Detalhada permanece como visão de orçamento.

### 6.2 Três camadas separadas

| Camada | Quem escreve | Campos |
| --- | --- | --- |
| **Status sistêmico** | Ninguém (somente leitura, vem do BI) | STATUS_RC, STATUS_COMPROMISSO, OC, comprador, DATA_PROMETIDA, DATA_NECESSIDADE, saldo, NF, pagamento |
| **Etapa operacional** | Derivada automaticamente + 2 fatos manuais | Etapa, sub-estado, responsável atual, dias na etapa |
| **Decisão do gestor** | Gestor de Tecnologia | Previsão de caixa, mês previsto, confiança, próxima ação, nota |

Hoje essas camadas estão misturadas: `derivarPoStatus` (em `types.ts`) calcula o status só pela data de entrega digitada (≤ 14/11 = Caixa 26; ≤ 30/11 = Em risco; depois = Caixa 27). Isso deve ser separado.

### 6.3 Etapas (derivadas do BI, primeira regra que casa vence)

| Ordem | Etapa | Regra |
| --- | --- | --- |
| 1 | E8 Pago | linha em `Realizado_Pago` |
| 2 | E7 Em pagamento | linha em `Realizado_Pendente` (NF contabilizada), independente do vencimento |
| 3 | E6 NF em lançamento | `Recebido \| Sem Contabilização` |
| 4 | E5 Recebido, aguardando NF | `CLOSED FOR RECEIVING` sem NF pendente |
| 5 | E4 Aguardando entrega | `OPEN` |
| 6 | E3 OC em aprovação | OC preenchida e `PENDING APPROVAL` ou `INCOMPLETE` |
| 7 | E2 Cotação / OC a emitir | RC `APPROVED` e OC vazia |
| 8 | E1 RC em aprovação | RC `PENDING APPROVAL` e OC vazia |
| 9 | E0 Demanda sem RC | cadastro manual (não existe hoje) |
| — | Residual | `CLOSED`, `CLOSED FOR INVOICING`, `SEM PAGAMENTO`, status vazio, saldo < R$ 1 mil, ou E5 há mais de 180 dias |

Sub-estados: E2 sem comprador; E4 atrasado (hoje > DATA_PROMETIDA); E4 chegou/falta receber (fato manual); E4 entrega parcial.
Fatos manuais permitidos: "chegou fisicamente" e "modalidade de pagamento" (Normal / Antecipado / Medição mensal). Se o sistema avançar a etapa, o sistema prevalece.
RC com várias linhas: exibir a etapa mais atrasada; cálculo sempre na linha RC+OC+PPM (grão atual).

### 6.4 Responsável atual (derivado, nunca digitado)

| Etapa | Responsável |
| --- | --- |
| E0 | Gestor do projeto |
| E1 | 1º aprovador (`1º Aprovador`) |
| E2/E3 | Comprador (`COMPRADOR`); sem comprador → N5 Compras (Torre de Compras, tabela de referência) |
| E4 no prazo | Fornecedor, acompanhado pelo comprador |
| E4 atrasado | Comprador |
| E4 chegou, falta receber | Gestor |
| E5 | Gestor (aceite) e comprador (cobrar NF) |
| E6 | Financeiro (área) |
| E7 | Tesouraria (área) |

Formato `Pessoa · Área`; sem pessoa → só a área. Precisa de uma tabela de referência de pessoas (nome, e-mail, papel, plataforma, torre) — **não existe hoje; registrar como dependência**.

### 6.5 Decisão do gestor

- **Previsão de caixa**: `Caixa 26` · `Caixa 27` · `Não ocorre` (substitui "não contabilizar"; exige motivo) + mês previsto.
- **Confiança**: `Confirmado` · `Provável` · `Incerto` (substitui a faixa "Em risco" por data).
- **Próxima ação**: bloqueio (lista fechada) + ação (≤ 80 caracteres) + idade; reinicia quando a etapa muda.
- **Alertas (não bloqueiam)**: previsão incompatível com a etapa; decisão velha (etapa mudou ou saldo variou > 5% — hoje já existe `isStale` para valor).
- **Compatibilidade**: curadorias já gravadas com `po_status` (`CONFIRMED`, `AT_RISK`, `CARRYOVER`, `CANCELLED`, `NO_VISIBILITY`) e `estimated_delivery_date` precisam continuar legíveis. **O mapeamento para o modelo novo é uma dúvida funcional: proponha alternativas, não assuma.**

### 6.6 Tabela do Radar Operacional

Colunas: `RC` (▲ prioridade alta, selo "n OCs") · `Projeto · Fornecedor` · `Valor` · `Etapa` (tooltip com status sistêmico) · `Dias na etapa` · `Responsável atual` · `Próxima ação` · `Previsão de caixa` · `Confiança` · ícones (nota, decisão velha, inconsistência).
Contadores/filtros: Esteira por etapa, Com você, Itens fora do SLA, Críticos (7 dias), Sem previsão no pareto, Previsão inconsistente, Ação desatualizada.
Visões: Por etapa (padrão) e Por responsável. Escopo inicial: pareto 80%. **Layout fixo** (hoje a tabela troca colunas após a curadoria e esconde OC/status sistêmico — corrigir).
Campos da planilha operacional não viram colunas: Prioridade = marcador ▲; Comprador vem do BI; N5 Compras = tabela de referência; Status detalhado = bloqueio + próxima ação.

### 6.7 Radar Executivo (cards)

Faixa **Caixa 2026**: `BG 2026` (orçamento) · `Realizado + Em pagamento` (caixa; linha de apoio "Falta virar caixa = BG − Realizado") · `Projeção Caixa 26` · `Gap vs BG` · `Carryover 27` (projeções, sempre com cobertura da curadoria por valor e data da próxima revisão; faixa mín–máx enquanto a cobertura do pareto < 80%).
Faixa **Gestão**: `Principal gargalo` · `Estoque de orçamento (A Emitir)`.
Compromisso em aberto aparece na barra de composição do BG, não como card.
Saem do destaque: "Execução do plano 94%", "GAP vs sistêmico", "BG Sistêmico" (vira "Compromisso em aberto"). "Dentro do plano/Acompanhar/Requer ação" e "Emissões faltantes/excedentes" vão para a Auditoria. **Qualquer remoção segue a regra de exclusão da seção 4.**

### 6.8 Cálculos

```
Caixa 26 (projeção) = Pago + Em pagamento (E7) + Σ saldo E0–E6 com previsão Caixa 26
Caixa 27            = Σ saldo E0–E6 com previsão Caixa 27
Carryover 27        = Caixa 27 de itens do BG 2026 (na V1 = Caixa 27)
Não avaliado        = Σ saldo E0–E6 sem previsão válida
Identidade: previsões + não avaliado + não ocorre + residual + E7 = compromisso aberto BI + demanda sem RC
```

Pagamento sugerido pela esteira (MVP): entrega + 10 dias + 39 dias (p80 NF→pagamento). `PAYMENT_LEAD_DAYS = 30` fixo deixa de ser a regra, mas **não remover sem análise de impacto**.
Datas de corte da Tesouraria (último pagamento, contabilização, recebimento) ainda **não definidas**: devem ser parâmetros, não constantes espalhadas.

### 6.9 Cores

- Cor forte **só** para urgência de caixa: neutro (no prazo) · âmbar (fora do SLA, ainda dá) · vermelho (perde Caixa 26 se não andar em 7 dias) · cinza + relógio (perdido para 2026).
- Natureza do número por traço: sólido = caixa; tracejado + "PROJ." = projeção; hachura/neutro + "ORÇAMENTO" = orçamento.
- Julgamento do gestor por forma (chip preenchido/contornado/riscado; ●●● ●●○ ●○○), não por cor.
- Vermelho nunca para "Não ocorre", estouro de BG ou gap.

### 6.10 Principal gargalo

Etapa (E0–E6; exclui E7, residuais e "Não ocorre") com maior Σ crítico; empate → maior (crítico + atenção); empate → etapa mais próxima do caixa. Só é exibido se ≥ R$ 1M ou ≥ 5% do "Falta virar caixa"; senão "Sem gargalo relevante". Mostra área responsável e top 3 responsáveis.

### 6.11 Estoque de orçamento (gestão orçamentária, **não** caixa)

```
Comprometido total       = Realizado + Em pagamento + Compromisso em aberto
A Emitir                 = máx(0, BG 2026 − Comprometido total)      (por projeto, sem compensar entre projetos)
Comprometido acima do BG = máx(0, Comprometido total − BG 2026)
Última movimentação relevante = data mais recente (≥ R$ 20 mil) entre: criação do compromisso (DT_CRIACAO_COMP),
  aprovação da RC (DT_REQ_APROV), emissão da NF, pagamento; e, quando o BI expuser, aprovação da OC, recebimento e
  última alteração da linha. DATA_PROMETIDA e DATA_NECESSIDADE não contam.
```

Situações (só projetos com A Emitir ≥ R$ 100 mil): **BG ativo** (movimentação ≤ 60 dias) · **BG sem evidência de uso recente** (> 60 dias ou nenhuma) · **BG liberável pelo gestor** (declaração) · **BG disponível para remanejamento** (validado pela gestão). Sem score, sem probabilidade, sem forecast.
Nunca somar com caixa ou projeção. Sem vermelho.

### 6.12 Fontes e números de referência (export de 25/09/2026)

| Item | Valor |
| --- | --- |
| `compromissos_detalhados.csv` (compromisso oficial operacional) | R$ 55.185.044,92 · 884 linhas · 754 RCs · 170 projetos |
| `Realizado.csv` 2026, `Compromisso_Conecta` | R$ 53.815.645,44 (diferença de R$ 1.369.399,48 em conciliação com o BI) |
| BG 2026 (`orcamento.csv`, BG_Q3) | R$ 145.542.101,22 |
| Realizado pago 2026 | ≈ R$ 72,4M |
| Em pagamento (`Realizado_Pendente`) | ≈ R$ 8,2M (342 linhas) |

Atenção:
- `RADAR_IMPLEMENTACAO.md` e possivelmente os testes usam o export de **24/09** (866 linhas, R$ 53.815.645,44). **Não altere asserções de teste para "fazer passar"**: explique a diferença e proponha como parametrizar a linha de base por export.
- `Compromisso_Conecta` se repete em 2026 e 2027 no `Realizado.csv`; só pode ser usado filtrando um único ano.
- `ValorCompromisso` é tratado como **saldo aberto** (validação final com o BI pendente).

### 6.13 Fora do escopo da V1

Probabilidade/forecast de consumo do BG, scoring, previsão estatística para itens não avaliados, notificações, edição por Suprimentos/Tesouraria (na V1 só Tecnologia edita; os demais só leem), integrações novas de dados.

---

## 7. Formato da resposta

- Português.
- Cite arquivo e linha para toda afirmação sobre o código atual.
- Separe claramente **fato observado** de **proposta**.
- Termine com a lista de **decisões que preciso tomar** antes da Fase 1.
- **Não implemente nada nesta rodada.**
