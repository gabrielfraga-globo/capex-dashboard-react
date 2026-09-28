# Padrão: Painel executivo escuro de carteira financeira (CAPEX)

Extraído da proposta de 4 telas (Visão Executiva, Radar de Caixa, Auditoria, Curadoria de Dados) aprovada em 28/09/2026. Descreve estrutura e estilo, não os dados da imagem. Os valores da imagem são ilustrativos; os números reais vêm dos cálculos do app (ver `references/telas.md`).

## 1. Leitura geral
- Estrutura: topbar única + abas de primeiro nível + grade de cards. Sem sidebar.
- Tom: financeiro/corporativo, denso mas arejado. Fundo azul-marinho muito escuro, cards um tom acima, bordas finas.
- Hierarquia de leitura (Z): faixa de KPIs no topo → blocos analíticos em grade 2×2 → tabela (quando existe) ocupa a largura toda.
- Cada tela responde uma pergunta: Visão Executiva (como está a carteira?), Radar (onde está o risco de caixa?), Auditoria (por quê?), Curadoria (o gestor confirma).

## 2. Componentes
**Navegação**
- Topbar: logo + título do produto + badge de período ("Set / 2026 · parcial") à esquerda; abas de texto à direita do título (Visão Executiva | Radar de Caixa | Auditoria | Curadoria). Aba ativa = texto branco + sublinhado azul 2px. Não são botões preenchidos.
- Cabeçalho de tela (Radar, Auditoria, Curadoria): título da tela + subtítulo entre parênteses em peso leve ("Auditoria (Análise e Exploração)"), sub-abas de texto (Resumo | Curadoria; Visão Geral | Risco | Plataformas | Projetos) e, à direita, filtros em dropdown compacto (Período, Plataforma, Gestor) + "+ Filtros".

**Cards de métrica (faixa de KPIs)** — ver `references/componentes.md#kpi`
- Ícone pequeno colorido + rótulo na mesma linha; valor grande abaixo; uma linha de contexto em cinza.
- Cor do valor só quando o KPI é exceção (vermelho = requer ação, âmbar = em risco, azul = cobertura/informação). Valores normais em branco.

**Cards analíticos** — título em caixa alta pequena + link "Ver … →" azul no canto direito; corpo com um único tipo de visualização.
- Execução: número grande + barra segmentada 100% + legenda em linha + nota de alerta com ícone.
- Ritmo: linhas [ponto de status · rótulo · barra · nº · R$ · %]; abaixo, "Principais projetos que requerem ação" (top 3 com barra vermelha e valor).
- Progresso por programa: mini-tabela [Programa · barra de progresso com % · Orçamento · Risco (R$ colorido)] + linha Total.
- Fluxo: toggle segmentado Acumulado | Mensal; legenda Realizado (azul, sólido) / Planejado (pontilhado); marcador vertical da data-base com rótulo; coluna lateral com Realizado acumulado, Planejado acumulado, Desvio (vermelho se negativo) + %.

**Cards de resumo com mini-gráfico (Radar)**: rótulo em caixa alta, valor grande, 2 linhas de contexto, mini-visual no rodapé (sparkline, mini-barras por etapa, donut de criticidade com legenda).

**Chips de etapa**: pílulas retangulares "E2 · OC a emitir / 54 · R$ 10,5M"; selecionada = borda + fundo azul; excesso colapsa em "+ N etapas ▾".

**Tabelas** — ver `references/componentes.md#tabela`
- Barra acima: busca à esquerda; "Mais filtros" e "Exportar" (links com ícone) à direita.
- Cabeçalho cinza pequeno; linhas altas (44–48px) com célula de duas linhas (principal + secundária em cinza) para Etapa · Responsável.
- Status em tag colorida (Em risco âmbar/vermelho, Caixa 27 vermelho-escuro, Atenção âmbar, Normal verde-acinzentado). Primeira coluna = ponto de criticidade.
- Ação por linha: "⋯" (Radar) ou botão primário "Confirmar e próxima" (Curadoria).
- Paginação no rodapé: "1–10 de 206" + páginas.

**Segmented control de decisão (Curadoria)**: 4 botões lado a lado (Caixa 26 | Em risco | Caixa 27 | Não ocorre); selecionado preenchido em azul; sugestão do sistema aparece como tag separada na coluna anterior.

**Painel de detalhe (Curadoria)**: coluna direita fixa (~320px): identificação da RC, grade de atributos 2 colunas, "Sua classificação", "Campos opcionais" (entrega ajustada, prioritária toggle, próxima ação, observação), botões "Confirmar e próxima (Enter)" + "Salvar e fechar".

**Waterfall (Auditoria)**: "Decomposição do gap (BG ao projetado)": barras horizontais — total inicial cinza, reduções vermelhas deslocadas, resultado azul; valores alinhados à direita.

## 3. Grade
- Largura útil ~1440px, margens 16–24px, gap 12–16px.
- Visão Executiva: faixa de 5 KPIs (5 colunas iguais) → grade 2×2 de cards (colunas 50/50; linha 1 um pouco mais alta que a 2).
- Radar: 4 cards de resumo (larguras 1.2/0.9/1.1/1) → chips → tabela largura total.
- Auditoria: linha 1 em 3 colunas (≈25/40/35), linha 2 em 2 colunas (≈35/65), rodapé de links.
- Curadoria: conteúdo ≈75% + painel de detalhe ≈25%; no topo 4 cards de progresso + 1 card de destaque (pareto não confirmado).
- Telas executivas sem rolagem em ≥ 1280×800; Radar e Curadoria rolam só dentro da tabela.

## 4. Cor, tipografia, espaçamento
- Fundo #0B1220–#0E1526; card #111A2C–#131C2F; borda #1E2A40; texto #E6EAF2; texto secundário #8A96AD.
- Azul primário (#2F6BFF / #3B82F6): aba ativa, links, botões primários, chip selecionado, série "Realizado", cobertura.
- Semânticas: verde #22C55E (no ritmo, positivo), âmbar #F5A524 (acompanhar, atenção, em risco), vermelho #EF4444 (requer ação, crítico, desvio negativo), roxo #8B5CF6 (emitido, categoria), cinza #64748B (não emitido, neutro).
- Categorias em barras de programa/plataforma: azul, verde, roxo, âmbar, cinza — cor por categoria, estável entre telas.
- Tipografia sans (Inter/Segoe): valor KPI 28–32px/700; valor de destaque de card 36–44px/700; título de card 11–12px caixa alta/600 com tracking; corpo 13px; secundário 11–12px.
- Espaçamento confortável: padding de card 16–20px; linhas de lista 28–32px; respiro entre faixa de KPIs e grade.

## 5. Receitas
- KPI: ícone + rótulo → valor → contexto. Máximo 1 linha de contexto.
- Card analítico: título + link de drill → visual → rodapé opcional (total ou alerta).
- Lista com barra: [ponto/ícone] rótulo · barra proporcional ao maior · valor · %.
- Tabela operacional: crit · id · entidade/fornecedor · etapa·responsável · valor · data · status/decisão · ação.

## 6. Estados
- Carregando: skeleton por card (mesmo tamanho do card final), tabela com 5 linhas skeleton.
- Vazio: mensagem centrada no card ("Nenhuma RC pendente — curadoria em dia") com ícone neutro.
- Erro: card com borda vermelha, mensagem curta e "Tentar de novo".
- Parcial: selo "parcial" no badge de período; valores ausentes = "—", nunca 0.

## 7. Responsividade e acessibilidade
- < 1280px: KPIs em 3+2; grade 2×2 vira 1 coluna; painel de detalhe da Curadoria vira drawer.
- < 768px: abas viram menu; tabelas viram cartões.
- Contraste mínimo 4.5:1 para texto; cor nunca é o único sinal (tags têm texto; pontos têm aria-label).
- Alvos ≥ 32px; foco visível (anel azul); atalhos na Curadoria (1–4 classifica, Enter confirma, J/K navega).
- Gráficos com aria-label resumindo o valor principal.

## 8. Visual × dados
Fixo no padrão: grade, tipos de card, tipos de gráfico, ordem das colunas, cores semânticas. Variável: todos os números, listas de projetos/programas/etapas, rótulos de período e data-base.

## 9. Conexão com dados
Neste projeto: carteira (`public/data/carteira-processed.json`, derivada do BI/CSV), RCs (`radar-bundle.json`), decisões dos gestores (API `/api/curation`, Neon). Em outros contextos: dataset Power BI, SQL, SharePoint/Excel ou API REST — cada card consome uma função de cálculo pura, nunca o dado bruto.

## 10. Prompt de reuso
```
Crie a tela [nome] seguindo docs/design/capex-executivo-escuro/pattern.md:
- topbar com abas de texto e badge de período; cabeçalho de tela com sub-abas e filtros à direita
- faixa de KPIs (ícone + rótulo, valor, 1 linha de contexto; cor só em exceção)
- cards analíticos com título caixa alta + link "Ver … →"
- tabela com crit, célula de duas linhas, tags de status e ação por linha
- cores e tipografia da seção 4; estados da seção 6
- métricas: [lista]; dados de [fonte], via funções puras testadas
```
