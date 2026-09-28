# Componentes do padrão

## kpi
`<KpiStat icon label value context tone?>` — tone: 'neutral' | 'info' | 'warn' | 'crit' colore só o valor e o ícone. Altura fixa (~96px). Clique opcional (drill).

## card
`<SectionCard title action?={{label, onClick}}>` — título 11–12px caixa alta, link azul "Ver … →" à direita. Sem card dentro de card.

## barlist
`<BarList rows=[{dot?, label, value, count?, pct?, color}]>` — grade [ponto][rótulo 140px][barra 1fr][nº][R$][%]; barra proporcional ao maior valor da lista; rótulo antes da barra, nunca truncado sem `title`.

## segbar
`<SegmentedBar parts=[{label, pct, color}]>` — barra 100% com % dentro do segmento quando ≥ 6%; legenda em uma linha abaixo.

## summary-card (Radar)
`<SummaryCard label value lines=[…] mini=<Sparkline|MiniBars|Donut>>` — mini-visual no rodapé do card, 32–40px de altura. Sparkline/mini-barras só quando houver série real (histórico semanal ou distribuição por etapa); sem série, omitir.

## chips
`<StageChips items=[{code, label, count, value}] selected onToggle maxVisible=5>` — excedentes em "+ N etapas ▾".

## tabela
Barra: busca · "Mais filtros" · "Exportar". Cabeçalho 11px cinza. Linha 44–48px. Célula dupla (principal 13px + secundária 11px cinza). Tags: `<StatusTag kind>`. Paginação "a–b de N". Ordenação por criticidade e valor por padrão.

## decision (Curadoria)
`<DecisionSegmented value suggested onChange>` — 4 botões; selecionado preenchido azul; sugestão não pinta o botão, aparece como tag na coluna "Sugestão do sistema".

## detail-panel
Coluna fixa à direita (≥ 1280px) ou drawer (< 1280px). Seções: identificação, atributos (grade 2 col), sua classificação, campos opcionais, ações ("Confirmar e próxima" primário + "Salvar e fechar").

## waterfall
`<GapWaterfall steps=[{label, value, kind:'start'|'minus'|'result'|'diff'}]>` — usa `buildBridge` de executive.ts.
