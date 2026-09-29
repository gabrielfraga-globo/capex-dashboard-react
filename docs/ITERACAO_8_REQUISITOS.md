# Iteração 8 — requisitos (29/09/2026)

Feedback de stakeholders sobre a iteração 7. Leia junto com `docs/AGENT_BRIEF.md` e `docs/ITERACAO_7_REQUISITOS.md`.

## Já feito pelo arquiteto (não refazer)
- Menu: aba **Curadoria** abre `/curadoria` (RadarPage com a aba Curadoria, título "Curadoria de Dados"). `/radar` continua sendo a Classificação Risco Empenho.
- **Auditoria saiu do menu.** Só se chega a ela pelos links "Ver detalhes →" e "Ver fluxo completo →" (que já navegam para `/auditoria`). Não recriar a aba.
- Preprocessador (`src/lib/csvProcessingCore.ts`): com a Rubrica há várias linhas por projeto/ano; `compromisso`, `aEmitirFonte` e `deltaCaixaFonte` agora somam as rubricas dentro do ano e pegam o maior ano (antes o `Math.max` descartava rubricas: compromisso caía de R$ 58,14M para R$ 54,14M).
- `merge.test.ts` e `payment.test.ts` leem fixtures congeladas (`__fixtures__/*-2026-09-26.*`), não mais `public/data`.

## Conferência da Rubrica (export de 29/09)
Totais iguais com e sem Rubrica → não houve inflação por cross join:
BG 2026 R$ 145,54M · BG 2027 R$ 73,91M (idênticos ao export anterior).
Demais variações são dado novo: realizado R$ 72,76M · em pgto R$ 10,62M (383 linhas NF, 152 RCs) · compromisso R$ 58,14M (921 linhas, 807 RCs).
Rubricas: MDO, SOLUÇÃO, INSTALAÇÃO, RESERVA (orçamento), presentes em orcamento, Realizado, Fluxo_Mensal, Realizado_Detalhado e compromissos_detalhados.

## BG Vivo — definição (decisão 29/09)
BG Vivo = o que a carteira vai consumir no ano se tudo o que já foi emitido acontecer e o saldo ainda não emitido for emitido.

    BG Vivo 26 = Realizado 26 + Em pagamento 26 + Compromisso 26 + A emitir 26
    Compromisso 26 = RCs/OCs com caixa em 2026 (CAIXA_26 + EM_RISCO; sem RESIDUAL/DESCONHECIDA, sem CAIXA_27, sem NAO_OCORRE)
    A emitir 26   = Σ por projeto de max(0, BG Gov 26 − Realizado − Em pgto − Compromisso 26 do projeto)   ← "delta linha a linha, projeto agrupado"

Mudança em relação à 7: o A emitir usa **Compromisso 26 do projeto** (hoje usa `p.compromisso`, que inclui 2027 e residual).

Por que o BG Vivo fica ACIMA do BG Gov: projeto que já consumiu mais que seu BG (estouro) não tem "a emitir" negativo para compensar, então o estouro soma.
Export 29/09 (sem curadoria): 91 projetos com realizado+pgto+compromisso > BG, estouro total R$ 13,5M (26 deles sem BG 2026, R$ 3,7M). Maiores: Core IP BH R$ 3,3M; Produção Central Multisites R$ 2,6M; Estações Design (33) R$ 2,1M.
Identidade (vira teste): como r + e + c26 + max(0, o − r − e − c26) − o = max(0, r + e + c26 − o), vale
`bgVivo − bgGov = Σ_p max(0, r + e + c26 − o) + compromisso 26 sem projeto casado na carteira`.
Ou seja: a diferença para o BG Gov é exatamente a soma dos estouros — nunca pode ser negativa.

## Visão Executiva
- Faixa de KPIs: **remover** "Execução do plano" e "Ritmo dos projetos". Ficam 6 cartões, nesta ordem:
  BG Gov · BG Vivo · Em pagamento · Compromisso 26 · A emitir · Em risco.
  (Os blocos "Execução do plano" e "Ritmo de execução" abaixo continuam.)
- Cartão BG Vivo: linha de contexto = "+R$ x vs BG Gov · estouro em N projetos" (clicável → abre painel com os projetos em estouro). Tooltip com a fórmula.
- Todos os cartões com a MESMA altura (valor + 1 linha de contexto; nada de 2ª linha só em um cartão).
- Coluna esquerda (Execução + Fluxo) e direita (Ritmo) com a base alinhada; o bloco Fluxo não pode encostar/ser cortado no rodapé.
- Painel "Projetos em risco" (RiskPanel/SidePanel): hoje 576px, tabela cortada com scroll horizontal. Largura min(1100px, 92vw); colunas Projeto (quebra em até 2 linhas, nome completo no title), Plataforma (n4Curta), Gestor, RCs, Valor (R$ com separador, à direita, tabular-nums); linhas py-3; sem scroll horizontal.
- 2027: mesmos 6 lugares; onde não se aplica mostrar "—".

## Classificação Risco Empenho
- **Remover o cartão "A emitir"** da faixa de etapas (o valor continua na Visão Executiva).
- **Incluir as linhas em pagamento (E7)** na tabela. Fonte: `bundle.payments.inPayment` (sem `withoutRc`), agrupado por RC: 152 RCs, R$ 10,62M.
  - Linha própria, etapa "Em pagamento", valor = soma de `pending`; Entrega esperada = maior `paymentDate` (rótulo "pgto"); fornecedor/projeto do payment.
  - 47 RCs (R$ 6,12M) aparecem TAMBÉM como linha operacional (a RC ainda tem saldo de OC aberto). São dinheiros diferentes (NF a pagar × saldo a entregar): manter as duas linhas, não somar uma na outra.
  - Somente leitura: sem botões de classificação, sem menu de criticidade (dot cinza), sem edição de próxima ação.
  - Contam no cartão "Em pagamento" (que já existe) e respeitam busca/filtros de plataforma, gestor (approver) e aprovador. Checkbox "Mostrar em pagamento" (ligado por padrão).

## Rubrica (fluxo)
- Filtro "Rubrica" em Visão Executiva e Classificação Risco Empenho (multi-seleção; vazio = todas).
- Preprocessador passa a guardar, por projeto, os valores por rubrica (orcamento26/27, realizado26, emPagamento26, compromisso, meses2026 de orçamento e executado). Totais sem filtro NÃO podem mudar.
- Linhas operacionais ganham `rubricas: string[]` (de `commitments[].rubrica`); linhas em pagamento, `rubrica`.
- Remover o aviso "BG não filtrável por rubrica".
