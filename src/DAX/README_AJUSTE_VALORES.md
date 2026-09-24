# Ajuste dos valores CAPEX via CSV

## Objetivo
Reproduzir no portal o mesmo contexto das tabelas do Power BI, sem somar medidas em grãos detalhados.

## Arquivos finais em public/data
- `orcamento.csv`: resultado de `01_orcamento.dax`
- `Realizado.csv`: resultado de `02_realizado.dax`
- `Fluxo_Mensal.csv`: resultado de `03_fluxo_mensal.dax`
- `carteira-processed.json`: gerado pelo preprocessamento

`Realizado_Detalhado.csv` pode ser mantido para auditoria, mas não alimenta mais o gráfico mensal.

## Passos
1. No DAX Studio, executar cada consulta individualmente.
2. Com `Results > File` marcado, executar novamente e salvar com os nomes acima.
3. Copiar os três CSVs para `public/data`.
4. Substituir `src/lib/csvProcessingCore.ts` pelo arquivo fornecido.
5. Substituir `scripts/preprocessCsv.mjs` pelo arquivo fornecido.
6. Criar `scripts/validarDados.mjs` com o arquivo fornecido.
7. No `package.json`, adicionar: `"validate-data": "node scripts/validarDados.mjs"`.
8. Executar:
   - `npm run process-data`
   - `npm run validate-data`
   - `npm run dev`
9. Comparar os totais com o Power BI antes de publicar.

## Observação sobre nomes do modelo
As consultas usam `dNatureza[Natureza]`, `dN4[N3]`, `dRCs[REQ_COMPRA]` e `dCalendarioCaixa[Mês]`.
Se o modelo usar outro nome exato, ajuste somente o identificador correspondente no DAX.
