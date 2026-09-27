# AGENT_BRIEF — Carteira CAPEX / Radar de Caixa

Leia este arquivo inteiro antes de qualquer fase. Ele vale mais que qualquer suposição sua.

## Regras (inegociáveis)
- NÃO rode `git commit`, `git push` nem `vercel`. Quem commita é o Gabriel.
- NÃO abra com view_file/cat os JSON grandes de `public/data/` nem de `src/features/radar/__fixtures__/`. Para ler números, rode um script `npx tsx` temporário e apague depois.
- NÃO altere oráculos (valores esperados) de testes existentes. Teste novo, sim.
- NÃO apague arquivos sem dizer no relatório quais e por quê.
- Ao final, restaure `public/data/*.json` com `git checkout -- public/data/`.
- Não invente números. Se não rodou, escreva "não rodei".

## Definição de pronto
1. `npm run verify` passa (tsc -b + typecheck da API + vitest). `tsc --noEmit` NÃO serve: não checa os projetos referenciados.
2. Cole no relatório as últimas linhas da saída do `npm run verify`.
3. Relatório curto: arquivos alterados/criados/apagados, saída do verify, os números pedidos na fase. Nada de resumo de marketing.

## Onde fica cada coisa
- `src/App.tsx`: cabeçalho, abas, filtros globais (filterStore), roteamento simples (`src/lib/simpleRouter.ts`).
- `src/pages/RadarExecutivoPage.tsx`: tela inicial (Visão Executiva).
- `src/pages/AuditoriaCarteiraPage.tsx`: Auditoria.
- `src/features/radar/RadarPage.tsx`: Radar de Caixa (rota `/radar`), abas Curadoria/Operacional.
- `src/features/radar/executive.ts`: cálculos puros do resumo executivo (saldos, projetos em risco, curadoria, insights, gargalo, ponte do BG). Tudo testado em `executive.test.ts`.
- `src/features/radar/operational.ts`: uma linha por RC (`buildOperationalRows`), etapa dominante, responsável (`owner`, `ownerArea`), classificação efetiva (`classification`, `isClassificationConfirmed`).
- `src/features/radar/decision.ts`: `suggestClassification`, `classificationFromDecision`.
- `src/features/radar/useCuration.ts`: carrega o bundle (`public/data/radar-bundle.json`) e a curadoria da API; `salvarRc` grava decisões.
- Componentes extraídos: `src/components/ExecucaoPlanoCard.tsx`, `AnaliseRiscoPanel.tsx` (textos "Ritmo de execução"), `FluxoCaixaChart.tsx` (prop `compact`).
- Tokens de cor (tailwind): `info`, `ok`, `warn`, `crit` (+ `-10`, `-30`). Neutros: `text`, `text-muted`, `text-faint`, `border`, `card`, `card-alt`.

## Vocabulário (use exatamente)
- Classificação da RC (4 estados): **Caixa 26**, **Em risco**, **Caixa 27**, **Não ocorre**.
- Valores: **Realizado**, **Em processamento** (em pagamento), **Provisionado 26**, **Provisionado em risco**, **Provisionado 27**, **Comprometido**, **A emitir**.
- **Caixa projetado 2026** = realizado + em processamento + provisionado 26 (SEM o em risco).
- **Saldo do projeto** = BG 2026 − realizado − em pagamento − comprometido. Parado = sem pagamento, RC ou compromisso novo há mais de 60 dias.
- **Ritmo de execução** (No ritmo / Acompanhar / Requer ação) é status de execução por projeto. NÃO chame de "risco": "Em risco" é só a classificação de caixa das RCs.
- Somas de provisionado excluem etapas RESIDUAL e DESCONHECIDA.

## Estilo
- Tema escuro atual, fonte atual. Cor só em exceção (ponto, borda, segmento). Números em `text-text`. Sem gradientes, sem emojis novos.
- Telas executivas sem rolagem em ≥ 1280×800.
