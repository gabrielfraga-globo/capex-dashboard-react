# Telas do projeto × padrão

Status em 28/09/2026 (branch feat/radar-risco-caixa). "Tem" = já implementado; "Falta" = a fazer; "Dado" = de onde vem o número.

## Visão Executiva (src/pages/RadarExecutivoPage.tsx)
| Bloco do padrão | Tem | Falta | Dado |
|---|---|---|---|
| Topbar com abas de texto | abas como botões preenchidos | trocar para abas de texto sublinhadas; badge de período ao lado do título | App.tsx |
| KPI Projetos | sim (162) | ícone/estilo do padrão | contagem por ritmo |
| KPI Execução do plano | não | novo: 94% "vs plano provisionado" | ExecucaoPlanoCard (mesma conta) |
| KPI Ritmo | sim (48 requer ação) | rótulo "Ritmo dos projetos" | AnaliseRiscoPanel |
| KPI Em risco (caixa) | sim (R$ 30,1M) | contexto "N projetos" | buildProjectsAtRisk (usar 30,1 real, não 28,8 da imagem) |
| KPI Cobertura do BG | não (hoje há Orçamento e Saldo remanejável) | novo: projetado ÷ BG (70%), "R$ 101,9M de R$ 145,5M" | realizado + em pgto + provisionado 26 |
| Execução do plano (card) | sim | barra com % nos segmentos, cores do padrão | ExecucaoPlanoCard |
| Ritmo + Principais projetos que requerem ação | ritmo sim | top 3 abaixo, com barra vermelha | projetos "Requer ação" por valor |
| Progresso por programa | composição por plataforma | virar mini-tabela: Programa · progresso % · Orçamento · Risco (R$) + Total | por n4: executado/BG, BG, em risco |
| Fluxo de caixa | sim | toggle Acumulado/Mensal; marcador da data-base | buildFlowSummary |
Decisão pendente: saldo remanejável sai da faixa (vira linha no card Ritmo ou link) para dar lugar a Cobertura do BG — confirmar com o Gabriel.

## Radar de Caixa (src/features/radar/RadarPage.tsx + OperationalTable.tsx)
| Bloco | Tem | Falta |
|---|---|---|
| Cabeçalho com sub-abas Resumo · Curadoria + filtros à direita | título "Radar de Risco de Caixa", filtros num card, abas Curadoria/Operacional | renomear abas: Operacional → Resumo; Curadoria antiga → sai (vira a tela Curadoria) |
| 4 cards de resumo | sim | mini-visuais: mini-barras por etapa no "Onde trava"; donut já existe; sparklines só após snapshot semanal |
| Chips de etapa | sim (contadores) | estilo pílula, seleção filtra, "+ N etapas" |
| Tabela | sim, com 4 botões de decisão por linha | no Resumo: coluna Classificação vira tag só leitura + "⋯"; decisão fica na Curadoria; paginação 10/pg |

## Auditoria (src/pages/AuditoriaCarteiraPage.tsx)
| Bloco | Tem | Falta |
|---|---|---|
| Sub-abas Visão Geral · Risco · Plataformas · Projetos | não (bento com seções) | criar sub-abas; Visão Geral = layout abaixo |
| Ritmo de execução | ExecucaoPlanoCard + AnaliseRiscoPanel | versão compacta no padrão |
| Decomposição do gap | buildBridge + BridgePanel | waterfall horizontal |
| Composição por plataforma | existe (bento) | barlist do padrão |
| Fluxo completo | FluxoCaixaChart | card do padrão |
| Projetos que pedem ação | Projetos prioritários + Plano de ação (separados) | tabela única: Projeto · Responsável · Motivo · Próxima ação · Valor exposto · Data limite |
| Rodapé Matriz · Detalhamento · Exportar | Matriz e Detalhamento como bento | links que abrem painel/aba |

## Curadoria de Dados (nova tela; hoje é a aba Curadoria antiga do Radar)
| Bloco | Tem | Falta |
|---|---|---|
| Progresso (x de N do pareto, %) | buildCurationConsistency | card do padrão |
| Pendentes · Vencidas · Divergentes | contagens existem (consistency) | cards + abas-filtro com contagem |
| Destaque "Ver Pareto R$ X não confirmados" | não | card azul de destaque |
| Tabela com sugestão + 4 botões + "Confirmar e próxima" | decisão inline existe na OperationalTable | coluna Sugestão (tag), coluna Sua classificação, ação rápida |
| Painel de detalhe com campos opcionais | painel lateral da 4c-1 | fixar à direita; toggle Prioritária; Observação (motivo se Não ocorre); atalhos |
Filtro "Plataforma: Minha" depende de saber quem é o gestor logado (auth já identifica o usuário; mapear e-mail → N4 pela tabela de gestores).

## Diferenças da imagem que NÃO devem ser copiadas
- Em risco R$ 28,8M / 75 projetos → usar o cálculo (R$ 30,1M / 77 hoje).
- Planejado acumulado R$ 129,2M e desvio −R$ 27,5M → o planejado acumulado real até setembro é R$ 59,6M e o desvio é positivo (+R$ 21,1M); o plano concentra desembolso no 4º trimestre.
- "Plataforma de Controles, Tecnologia, Operações, Conteúdo" → a carteira tem 4 N4 (Captação e Produção, Pós-Prod. e Design, Metadados e Mídias, Pré-Produção).
- Sparklines sem histórico → omitir até existir snapshot semanal.
