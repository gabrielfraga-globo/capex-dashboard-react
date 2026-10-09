# Atualização de dados a partir do Power BI

Gera os CSVs de `public/data` direto do Power BI Desktop aberto e publica a atualização.
Substitui a rotina manual de abrir o DAX Studio, rodar as 5 consultas e exportar uma a uma.

## Uso

1. Abra o `.pbix` da carteira CAPEX no Power BI Desktop e clique em **Atualizar**.
2. Dê dois cliques em `atualizar-dados-bi.cmd`, na raiz do repositório.
3. Confira o resumo de linhas (antes → agora) e responda **s** para publicar.

Pelo terminal: `npm run update-bi`, ou `.\atualizar-dados-bi.cmd` com os parâmetros abaixo.

| Parâmetro | Efeito |
|---|---|
| `-Publicar Git` (padrão) | `git commit` e `git push` só dos arquivos de dados. A Vercel publica pelo GitHub: um push em `main` gera o deploy de produção e um push em outra branch gera um deploy de preview. |
| `-Publicar Vercel` | `npx vercel deploy --prod` direto desta pasta (exige `vercel login`). |
| `-Publicar Nenhum` | Só atualiza os arquivos locais. Bom para conferir com `npm run dev`. |
| `-Pbix "parte do nome"` | Escolhe o arquivo quando há mais de um Power BI aberto. |
| `-Porta 51234` | Conecta numa porta específica e pula a detecção. |
| `-Sim` | Não pergunta nada. Avisos graves (modelo desatualizado, queda de linhas, validação reprovada) **abortam**. |
| `-AceitarMudancaDeColunas` | Aceita que o cabeçalho de um CSV mude (ex.: coluna nova numa consulta). |
| `-PularValidacao` | Não roda `npm run validate-data`. |
| `-RodarTestes` | Roda `npm run verify` antes de publicar. |
| `-SomenteDados` | O commit leva só os dados, sem os arquivos do processo de atualização. |
| `-AdomdPath <dll>` | Caminho do `Microsoft.AnalysisServices.AdomdClient.dll`, se não for achado sozinho. |

## O que o script faz

```
Power BI Desktop (msmdsrv local)
   │  ADOMD.NET (o mesmo cliente que o DAX Studio usa)
   ▼
public/data/*.dax ──► .atualizacao-bi/tmp/*.csv     consulta → CSV temporário
                         │  confere: 0 linhas? colunas mudaram? queda > 30%?
                         ▼
                      backup ► public/data/*.csv     troca os arquivos
                         ▼
          npm run process-data  → carteira-processed.json, radar-bundle.json
          npm run validate-data
                         ▼            (se falhar: restaura o backup)
          git commit + push        → Vercel faz o build e publica
```

| Consulta | CSV gerado |
|---|---|
| `orcamento.dax` | `orcamento.csv` |
| `Realizado.dax` | `Realizado.csv` |
| `fluxo_mensal.dax` | `Fluxo_Mensal.csv` |
| `Realizado_Detalhado.dax` | `Realizado_Detalhado.csv` |
| `compromissos_detalhados.dax` | `compromissos_detalhados.csv` |

Para incluir uma consulta nova, salve o `.dax` em `public/data` e acrescente uma linha em
`$Consultas`, no início do `scripts/atualizar-dados-bi.ps1`.

## Formato do CSV

É o mesmo do export do DAX Studio, que o `csvProcessingCore.ts` já lê:

- separador `;`, UTF-8 sem BOM, quebra de linha CRLF;
- cabeçalho sem o nome da tabela (`dN4[N4]` vira `N4`);
- texto entre aspas (`"` escapado como `""`), texto vazio como `""`;
- número com vírgula decimal e sem separador de milhar (`76232,4`), vazio para BLANK;
- data como `2026-05-25 00:00:00,000`.

## Proteções

- Nada em `public/data` muda até as 5 consultas rodarem sem erro.
- Uma consulta sem linhas, ou com colunas diferentes da versão anterior, interrompe tudo.
- Se o modelo foi atualizado há mais de 24h, ou se algum CSV perdeu mais de 30% das linhas, o script pede confirmação.
- Se `process-data` falhar ou a validação for recusada, os arquivos anteriores são restaurados.
- O commit inclui os CSVs, os JSONs gerados (se já forem versionados) e, quando tiverem alteração,
  os arquivos do próprio processo: este script, o `.cmd`, os `.dax`, `validateMetrics.mjs`,
  `preprocessCsv.mjs`, esta doc, `.gitignore` e `package.json`. Eles aparecem em bloco separado no
  resumo antes da confirmação. O resto do trabalho em andamento na branch fica de fora.
- Logs e backups ficam em `.atualizacao-bi/` (ignorada pelo git).

## Pontos de atenção

- **Cenário fixo nas consultas.** `Realizado.dax` e `compromissos_detalhados.dax` filtram `"BGQ3"`, e
  `orcamento.dax` usa a medida `[BG_Q3]`. O script mostra o cenário encontrado a cada execução, mas
  a virada para BGQ4 continua sendo manual nos `.dax` e no parser (a coluna `BG_Q3` é lida pelo nome).
- **Branch.** Os dados vão para a branch em que o repositório estiver. Para atualizar produção,
  rode estando em `main`.
- **Windows PowerShell 5.1.** O `.cmd` chama `powershell.exe`, não o `pwsh`, porque o cliente ADOMD
  do Power BI Desktop é .NET Framework.
- **Cliente ADOMD.** O script procura o cliente na pasta do Power BI Desktop (instalação comum e
  Microsoft Store), no DAX Studio e no GAC. Se não achar, tenta baixar o pacote do NuGet. Se a rede
  bloquear o download, instale o DAX Studio ou informe `-AdomdPath`.
