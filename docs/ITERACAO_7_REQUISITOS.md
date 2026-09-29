# Iteração 7 — Requisitos e decisões (28/09/2026)

Perguntas que o painel responde:
1. Qual o risco de desvio de caixa 2026 hoje?
2. Como está o Plano × Realizado pelas etapas reais do fluxo financeiro (Realizado, Em pagamento, Emitido 2026/2027, A emitir)?

## Glossário (vale para todo o código e toda a tela)
- **BG Gov** = orçamento aprovado (orcamento2026 / orcamento2027).
- **Emitido** = compromisso (RC/OC) em aberto. Pela curadoria vira "Emitido 2026" (Caixa 26 ou Em risco) ou "Emitido 2027" (Caixa 27). "Não ocorre" sai do emitido.
- **A emitir** (por projeto) = max(0, BG Gov − realizado − em pagamento − comprometido). É o que ainda não tem compromisso.
- **BG Vivo 2026** = realizado + em pagamento + emitido 2026 (Caixa 26 + Em risco) + a emitir 2026. O card mostra à parte quanto do BG Vivo está Em risco. (Decisão 28/09: Em risco conta em 2026.)
- **BG Vivo 2027** = emitido 2027 (Caixa 27) + a emitir 2027 (orcamento2027 − comprometido para 2027, mínimo 0).
- **Atenção:** o orçamento de 2027 na base cobre só jan–mar/2027 (orcamento.csv traz 2027 até março). Rotular sempre "BG 2027 (jan–mar)" até o BI exportar o ano inteiro.
- **Em pagamento (E7)** não é linha de OperationalRow: vem de bundle.payments (`buildPipelineCounters().byStage.E7`) e deve ser passado para `buildStageCounters`/`buildDirectorateBreakdown`.
- **Delta caixa** = BG Gov − realizado (realizado = pago + em pagamento).

## Motor de etapas (substitui o atual)
Ordem de avaliação por linha de compromisso. Status = STATUS_COMPROMISSO (fallback STATUS_RC); OC = ORDEM_DE_COMPRA.
| Código | Etapa | Regra | Diretoria |
|---|---|---|---|
| E0 | A emitir | valor por projeto, sem RC (não é linha de compromisso) | Tecnologia |
| E1 | RC em aprovação | REQ ≠ null, sem OC, status = PENDING APPROVAL | Tecnologia |
| E2 | Negociação / emissão de OC | REQ ≠ null, sem OC, status = APPROVED; **ou status = INCOMPLETE (com ou sem número de OC — OC ainda não criada; decisão 28/09)** | Suprimentos |
| E3 | OC em aprovação | REQ ≠ null, OC ≠ null, status = PENDING APPROVAL | Suprimentos |
| E4 | Aguardando entrega / pagamento | REQ ≠ null, OC ≠ null, status ∉ {PENDING APPROVAL, INCOMPLETE, CANCELLED} (inclui os antigos E5 "recebido" e E6 "NF em lançamento") | Suprimentos |
| E7 | Em pagamento | NF lançada sem data de pagamento (linhas de Realizado_Pendente / payments.inPayment) | Contas a Pagar |
| E8 | Realizado | NF_DT_PAGAMENTO ≠ null (sai do Radar; só soma) | — |
- CANCELLED: fora da esteira.
- A etapa E6 deixa de existir na tela. Subestados de E4 (atrasado, parcial, chegou, recebido) continuam internos, para a data de pagamento sugerida e a criticidade.
- Não há campo "data contábil" na base; Em pagamento usa Realizado_Pendente (NF lançada, não paga), que é o equivalente disponível.

## Gargalo por diretoria (donut)
Tecnologia = A emitir + E1 · Suprimentos = E2 + E3 + E4 · Contas a Pagar = E7.

## Criticidade editável (decisão 28/09)
Qualquer gestor pode alterar a criticidade de uma RC. Grava no banco junto da decisão da RC (quem, quando). O sistema continua sugerindo; a tela mostra "ajustada" quando houver override.

## Visão Executiva
- Cards do topo: BG Gov 2026 (e 2027) · BG Vivo 2026 (e 2027) · Ritmo · Em risco · Execução.
- Seletor de Ano (2026 | 2027) na tela; troca os cards e a Execução.
- Execução do plano volta a mostrar R$ milhões além do %.
- Ritmo dos projetos = mesmo conceito e dados da Auditoria (status geral + top ofensores).
- Remover "Progresso por programa" (decisão 28/09). Fluxo de caixa sobe para baixo da Execução. Sem rolagem.
- Filtros retráteis: Programa (= N4; hoje "Plataforma") e Rubrica.
  - Rubrica: o orçamento (orcamento.csv) não tem rubrica; só realizado e compromissos têm. Enquanto o BI não exportar BG por rubrica, o filtro de rubrica filtra apenas realizado/emitido e a tela avisa que o BG não é filtrável por rubrica.

## Classificação Risco Empenho (antigo Radar de Risco de Caixa)
- Card "Impacto financeiro" → "Delta caixa (Orçamento − Realizado)".
- Chips da esteira pelo motor novo, incluindo "A emitir".
- Donut de Criticidade → donut "Gargalo por diretoria".

## Tabela de RCs
Larguras fixas por coluna, cabeçalho fixo (sticky), rolagem horizontal nativa, tooltip com o texto completo onde houver corte (sem quebrar linha), criticidade editável.

## Status da Implementação
- **Fase 7b (Visão Executiva)**: Implementada em 28/09/2026. Todos os requisitos de filtros, comportamento do modo 2027 (card de Execução % padronizado via fonte única de verdade, placeholder no Fluxo de Caixa, selo e números congelados no Ritmo de Execução) e layout (sem rolagem 1280x800) foram atendidos. `142` testes passando.
- **Fase 7c (Classificação Risco Empenho)**: Implementada. Aba e título renomeados; cards e layout da tabela atualizados com colunas fixas e rolagem horizontal; chips da esteira e donut "Gargalo por diretoria" integrados com a nova lógica; nota do ExecucaoPlanoCard em 2027 removida. Todos os testes passam.
