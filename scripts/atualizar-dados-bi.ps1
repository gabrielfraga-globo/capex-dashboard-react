<#
.SYNOPSIS
  Atualiza os CSVs do dashboard a partir do Power BI Desktop aberto e publica.

.DESCRIPTION
  1. Localiza o Power BI Desktop aberto (instância local do Analysis Services).
  2. Executa cada consulta public/data/*.dax e grava o CSV correspondente no
     mesmo formato do export do DAX Studio (";", vírgula decimal, texto entre aspas).
  3. Confere cabeçalho e volume de linhas contra o CSV anterior.
  4. Faz backup, troca os arquivos, roda "npm run process-data" e "npm run validate-data".
     Se algo falhar, restaura o backup.
  5. Publica: commit + push dos dados (a Vercel faz o deploy pelo GitHub),
     ou "vercel deploy --prod", ou nada.

.PARAMETER Pbix
  Parte do nome do arquivo .pbix, quando houver mais de um Power BI aberto.
.PARAMETER Porta
  Porta da instância local do Power BI (pula a detecção automática).
.PARAMETER Publicar
  Git (padrão) | Vercel | Nenhum.
.PARAMETER Sim
  Não pergunta nada; confirma tudo (avisos graves abortam em vez de perguntar).
.PARAMETER AceitarMudancaDeColunas
  Permite que o cabeçalho de um CSV mude em relação à versão anterior.
.PARAMETER PularValidacao
  Não roda "npm run validate-data".
.PARAMETER RodarTestes
  Roda "npm run verify" antes de publicar.
.PARAMETER SomenteDados
  No commit, envia só os dados. Sem ele, alterações nos arquivos do próprio processo
  de atualização (este script, o .cmd, o validador, a doc) também entram.
.PARAMETER AdomdPath
  Caminho para Microsoft.AnalysisServices.AdomdClient.dll (ou a pasta que o contém).

.EXAMPLE
  .\atualizar-dados-bi.cmd
.EXAMPLE
  .\atualizar-dados-bi.cmd -Publicar Nenhum
.EXAMPLE
  .\atualizar-dados-bi.cmd -Pbix "Carteira CAPEX" -Sim
#>
[CmdletBinding()]
param(
    [string]$Pbix,
    [int]$Porta,
    [ValidateSet('Git', 'Vercel', 'Nenhum')]
    [string]$Publicar = 'Git',
    [switch]$Sim,
    [switch]$AceitarMudancaDeColunas,
    [switch]$PularValidacao,
    [switch]$RodarTestes,
    [switch]$SomenteDados,
    [string]$AdomdPath
)

Set-StrictMode -Version 2
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }
$OutputEncoding = [Text.Encoding]::UTF8

# --------------------------------------------------------------------------
# Configuração
# --------------------------------------------------------------------------
$Raiz = Split-Path -Parent $PSScriptRoot
$Dados = Join-Path $Raiz 'public\data'
$Trabalho = Join-Path $Raiz '.atualizacao-bi'
$Carimbo = Get-Date -Format 'yyyyMMdd-HHmmss'
$PastaTemp = Join-Path $Trabalho "tmp\$Carimbo"
$PastaBackup = Join-Path $Trabalho "backup\$Carimbo"
$ArquivoLog = Join-Path $Trabalho "logs\$Carimbo.log"

# Consulta DAX -> CSV consumido pelo scripts/preprocessCsv.mjs
$Consultas = @(
    @{ Dax = 'orcamento.dax'; Csv = 'orcamento.csv' }
    @{ Dax = 'Realizado.dax'; Csv = 'Realizado.csv' }
    @{ Dax = 'fluxo_mensal.dax'; Csv = 'Fluxo_Mensal.csv' }
    @{ Dax = 'Realizado_Detalhado.dax'; Csv = 'Realizado_Detalhado.csv' }
    @{ Dax = 'compromissos_detalhados.dax'; Csv = 'compromissos_detalhados.csv' }
)
# Saídas geradas pelo "npm run process-data"
$Gerados = @('carteira-processed.json', 'radar-bundle.json')

# Arquivos do próprio processo de atualização: entram no commit junto com os dados
# quando tiverem alteração (exceto com -SomenteDados)
$ArquivosProcesso = @(
    'atualizar-dados-bi.cmd'
    'scripts/atualizar-dados-bi.ps1'
    'scripts/validateMetrics.mjs'
    'scripts/preprocessCsv.mjs'
    'docs/atualizacao-dados-bi.md'
    'public/data/orcamento.dax'
    'public/data/Realizado.dax'
    'public/data/fluxo_mensal.dax'
    'public/data/Realizado_Detalhado.dax'
    'public/data/compromissos_detalhados.dax'
    '.gitignore'
    'package.json'
)

# Queda de linhas acima disso exige confirmação
$LimiteQuedaLinhas = 0.30

$ptBR = [Globalization.CultureInfo]::GetCultureInfo('pt-BR')
$Invariante = [Globalization.CultureInfo]::InvariantCulture

# --------------------------------------------------------------------------
# Utilitários
# --------------------------------------------------------------------------
function Write-Etapa([string]$texto) { Write-Host ''; Write-Host "==> $texto" -ForegroundColor Cyan }
function Write-Ok([string]$texto) { Write-Host "    $texto" -ForegroundColor Green }
function Write-Aviso([string]$texto) { Write-Host "    AVISO: $texto" -ForegroundColor Yellow }
function Write-Info([string]$texto) { Write-Host "    $texto" }

function Confirmar([string]$pergunta, [bool]$padraoComSim = $true) {
    if ($Sim) { return $padraoComSim }
    $r = Read-Host "    $pergunta (s/N)"
    return ($r -match '^\s*(s|sim|y|yes)\s*$')
}

function Invoke-Externo([string]$exe, [string[]]$argumentos) {
    & $exe @argumentos
    if ($LASTEXITCODE -ne 0) { throw "'$exe $($argumentos -join ' ')' terminou com código $LASTEXITCODE." }
}

function Test-GitRastreado([string]$caminho) {
    # Em Windows PowerShell 5.1, redirecionar stderr de comando nativo com EAP=Stop vira exceção
    $eap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { & git ls-files --error-unmatch -- $caminho 2>&1 | Out-Null; return ($LASTEXITCODE -eq 0) }
    finally { $ErrorActionPreference = $eap }
}

function Get-QtdLinhasCsv([string]$caminho) {
    if (-not (Test-Path -LiteralPath $caminho)) { return $null }
    # Conta registros, não linhas físicas: campos entre aspas podem conter quebra de linha
    $texto = [IO.File]::ReadAllText($caminho, [Text.Encoding]::UTF8)
    $semAspas = [regex]::Replace($texto, '"(?:[^"]|"")*"', '')
    $n = @($semAspas -split "`n" | Where-Object { $_.Trim() -ne '' }).Count
    return [Math]::Max(0, $n - 1)
}

function Get-CabecalhoCsv([string]$caminho) {
    if (-not (Test-Path -LiteralPath $caminho)) { return $null }
    $sr = New-Object IO.StreamReader($caminho, [Text.Encoding]::UTF8)
    try { $l = $sr.ReadLine() } finally { $sr.Dispose() }
    if ($null -eq $l) { return $null }
    return $l.TrimStart([char]0xFEFF)
}

# --------------------------------------------------------------------------
# Power BI Desktop: localizar instância local
# --------------------------------------------------------------------------
function Get-InstanciasPbi {
    $lista = New-Object System.Collections.ArrayList
    $procs = @(Get-CimInstance Win32_Process -Filter "Name='msmdsrv.exe'" -ErrorAction SilentlyContinue)
    foreach ($p in $procs) {
        $portaInst = $null

        # O msmdsrv do Power BI é iniciado com -s "<workspace>\Data"; a porta fica em msmdsrv.port.txt (UTF-16)
        if ($p.CommandLine -and $p.CommandLine -match '-s\s+"([^"]+)"') {
            $arqPorta = Join-Path $Matches[1] 'msmdsrv.port.txt'
            if (Test-Path -LiteralPath $arqPorta) {
                $digitos = -join ([IO.File]::ReadAllBytes($arqPorta) | Where-Object { $_ -ge 48 -and $_ -le 57 } | ForEach-Object { [char]$_ })
                if ($digitos) { $portaInst = [int]$digitos }
            }
        }
        if (-not $portaInst) {
            $con = Get-NetTCPConnection -OwningProcess $p.ProcessId -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($con) { $portaInst = [int]$con.LocalPort }
        }
        if (-not $portaInst) { continue }

        $titulo = '(janela não identificada)'
        $exePbi = $null
        $pai = Get-Process -Id $p.ParentProcessId -ErrorAction SilentlyContinue
        if ($pai) {
            if ($pai.MainWindowTitle) { $titulo = ($pai.MainWindowTitle -replace '\s*-\s*Power BI Desktop\s*$', '') }
            try { $exePbi = $pai.Path } catch { $exePbi = $null }
        }
        [void]$lista.Add([pscustomobject]@{ Porta = $portaInst; Arquivo = $titulo; ExePbi = $exePbi })
    }
    return $lista
}

function Select-InstanciaPbi {
    if ($Porta) { return [pscustomobject]@{ Porta = $Porta; Arquivo = "porta $Porta"; ExePbi = $null } }

    $inst = @(Get-InstanciasPbi)
    if ($Pbix) { $inst = @($inst | Where-Object { $_.Arquivo -like "*$Pbix*" }) }

    if ($inst.Count -eq 0) {
        $complemento = ''
        if ($Pbix) { $complemento = " com '$Pbix' no nome" }
        throw "Nenhum Power BI Desktop aberto$complemento. Abra o .pbix do CAPEX, aguarde carregar e rode de novo."
    }
    if ($inst.Count -eq 1) { return $inst[0] }

    if ($Sim) { throw "Há $($inst.Count) arquivos do Power BI abertos. Use -Pbix ""parte do nome"" para escolher." }
    Write-Info 'Há mais de um Power BI aberto:'
    for ($i = 0; $i -lt $inst.Count; $i++) { Write-Info ("  [{0}] {1}  (porta {2})" -f ($i + 1), $inst[$i].Arquivo, $inst[$i].Porta) }
    $escolha = Read-Host '    Número do arquivo'
    $idx = 0
    if (-not [int]::TryParse($escolha, [ref]$idx) -or $idx -lt 1 -or $idx -gt $inst.Count) { throw 'Escolha inválida.' }
    return $inst[$idx - 1]
}

# --------------------------------------------------------------------------
# ADOMD.NET: carregar o cliente (vem com o Power BI Desktop / DAX Studio)
# --------------------------------------------------------------------------
function Test-TipoAdomd { return ($null -ne ('Microsoft.AnalysisServices.AdomdClient.AdomdConnection' -as [type])) }

function Import-Adomd([string]$exePbi) {
    if (Test-TipoAdomd) { return 'já carregado' }

    $nomes = @('Microsoft.AnalysisServices.AdomdClient.dll', 'Microsoft.PowerBI.AdomdClient.dll')
    $candidatos = New-Object System.Collections.ArrayList
    $pastas = New-Object System.Collections.ArrayList

    if ($AdomdPath) {
        if (Test-Path -LiteralPath $AdomdPath -PathType Leaf) { [void]$candidatos.Add($AdomdPath) } else { [void]$pastas.Add($AdomdPath) }
    }
    if ($exePbi) { [void]$pastas.Add((Split-Path -Parent $exePbi)) }
    foreach ($proc in @(Get-Process PBIDesktop -ErrorAction SilentlyContinue)) {
        try { if ($proc.Path) { [void]$pastas.Add((Split-Path -Parent $proc.Path)) } } catch { }
    }
    [void]$pastas.Add((Join-Path $env:ProgramFiles 'Microsoft Power BI Desktop\bin'))
    [void]$pastas.Add((Join-Path $env:ProgramFiles 'DAX Studio'))
    if ($env:LOCALAPPDATA) { [void]$pastas.Add((Join-Path $env:LOCALAPPDATA 'Programs\DAX Studio')) }
    [void]$pastas.Add((Join-Path $Trabalho 'adomd'))

    foreach ($pasta in $pastas) {
        foreach ($nome in $nomes) {
            $c = Join-Path $pasta $nome
            if (Test-Path -LiteralPath $c) { [void]$candidatos.Add($c) }
        }
    }
    $gac = Join-Path $env:WINDIR 'Microsoft.NET\assembly\GAC_MSIL\Microsoft.AnalysisServices.AdomdClient'
    if (Test-Path -LiteralPath $gac) {
        Get-ChildItem -LiteralPath $gac -Recurse -Filter '*.dll' | Sort-Object FullName -Descending | ForEach-Object { [void]$candidatos.Add($_.FullName) }
    }

    foreach ($c in $candidatos) {
        try { Add-Type -Path $c -ErrorAction Stop } catch { }
        if (Test-TipoAdomd) { return $c }
    }

    # Último recurso: baixar o pacote oficial do NuGet para .atualizacao-bi\adomd
    Write-Aviso 'Cliente ADOMD.NET não encontrado no Power BI/DAX Studio. Tentando baixar do NuGet...'
    $destino = Join-Path $Trabalho 'adomd'
    $zip = Join-Path $env:TEMP "adomd-$Carimbo.zip"
    $extraido = Join-Path $env:TEMP "adomd-$Carimbo"
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -UseBasicParsing -Uri 'https://www.nuget.org/api/v2/package/Microsoft.AnalysisServices.AdomdClient.retail.amd64' -OutFile $zip
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        [IO.Compression.ZipFile]::ExtractToDirectory($zip, $extraido)
        $dll = Get-ChildItem -LiteralPath $extraido -Recurse -Filter 'Microsoft.AnalysisServices.AdomdClient.dll' |
            Where-Object { $_.FullName -match '\\lib\\net4' } | Sort-Object FullName -Descending | Select-Object -First 1
        if ($dll) {
            New-Item -ItemType Directory -Force -Path $destino | Out-Null
            Copy-Item -Path (Join-Path $dll.DirectoryName '*') -Destination $destino -Force
            Add-Type -Path (Join-Path $destino $dll.Name)
            if (Test-TipoAdomd) { return (Join-Path $destino $dll.Name) }
        }
    } catch {
        Write-Aviso "Download falhou: $($_.Exception.Message)"
    }

    throw 'Não encontrei o cliente ADOMD.NET. Instale o DAX Studio (daxstudio.org) ou informe -AdomdPath "<caminho>\Microsoft.AnalysisServices.AdomdClient.dll".'
}

# --------------------------------------------------------------------------
# Execução DAX e gravação CSV (formato do export do DAX Studio)
# --------------------------------------------------------------------------
function ConvertTo-NomeColuna([string]$nome) {
    # "dN4[N4]" -> "N4" ; "[Orcamento_Cenarios]" -> "Orcamento_Cenarios"
    if ($nome -match '\[([^\]]*)\]$') { return $Matches[1] }
    return $nome
}

function Format-Valor($v, [type]$tipo) {
    if ($null -eq $v -or $v -is [DBNull]) {
        if ($tipo -eq [string]) { return '""' }
        return ''
    }
    if ($v -is [string]) { return '"' + $v.Replace('"', '""') + '"' }
    if ($v -is [datetime]) { return $v.ToString('yyyy-MM-dd HH:mm:ss,fff', $Invariante) }
    if ($v -is [double]) {
        if ([double]::IsNaN($v) -or [double]::IsInfinity($v)) { return '' }
        return $v.ToString('R', $ptBR)
    }
    if ($v -is [single]) { return $v.ToString('R', $ptBR) }
    if ($v -is [decimal]) { return $v.ToString($ptBR) }
    if ($v -is [bool]) { if ($v) { return 'True' } else { return 'False' } }
    if ($v -is [ValueType]) { return ([IFormattable]$v).ToString($null, $Invariante) }
    return '"' + ([string]$v).Replace('"', '""') + '"'
}

function Export-DaxParaCsv($conexao, [string]$arquivoDax, [string]$arquivoCsv) {
    $dax = [IO.File]::ReadAllText($arquivoDax, [Text.Encoding]::UTF8)
    $cmd = $conexao.CreateCommand()
    $cmd.CommandText = $dax
    $cmd.CommandTimeout = 900

    $leitor = $cmd.ExecuteReader()
    $escritor = $null
    $linhas = 0
    try {
        $n = $leitor.FieldCount
        $nomes = @(for ($i = 0; $i -lt $n; $i++) { ConvertTo-NomeColuna $leitor.GetName($i) })
        $tipos = @(for ($i = 0; $i -lt $n; $i++) { try { $leitor.GetFieldType($i) } catch { [object] } })
        $cabecalho = $nomes -join ';'

        $escritor = New-Object IO.StreamWriter($arquivoCsv, $false, (New-Object Text.UTF8Encoding($false)))
        $escritor.NewLine = "`r`n"
        $escritor.WriteLine($cabecalho)

        $valores = New-Object 'string[]' $n
        while ($leitor.Read()) {
            for ($i = 0; $i -lt $n; $i++) { $valores[$i] = Format-Valor $leitor.GetValue($i) $tipos[$i] }
            $escritor.WriteLine([string]::Join(';', $valores))
            $linhas++
        }
    } finally {
        if ($escritor) { $escritor.Dispose() }
        $leitor.Close()
    }
    return [pscustomobject]@{ Linhas = $linhas; Cabecalho = $cabecalho }
}

function Get-UltimaAtualizacaoModelo($conexao) {
    try {
        $cmd = $conexao.CreateCommand()
        $cmd.CommandText = 'SELECT [RefreshedTime] FROM $SYSTEM.TMSCHEMA_PARTITIONS'
        $leitor = $cmd.ExecuteReader()
        $max = $null
        try {
            while ($leitor.Read()) {
                $v = $leitor.GetValue(0)
                if ($v -is [datetime] -and $v.Year -gt 1900 -and ($null -eq $max -or $v -gt $max)) { $max = $v }
            }
        } finally { $leitor.Close() }
        if ($null -eq $max) { return $null }
        return [DateTime]::SpecifyKind($max, [DateTimeKind]::Utc).ToLocalTime()
    } catch { return $null }
}

# --------------------------------------------------------------------------
# Backup / restauração
# --------------------------------------------------------------------------
function Save-Backup {
    New-Item -ItemType Directory -Force -Path $PastaBackup | Out-Null
    $arquivos = @($Consultas | ForEach-Object { $_.Csv }) + $Gerados
    foreach ($a in $arquivos) {
        $origem = Join-Path $Dados $a
        if (Test-Path -LiteralPath $origem) { Copy-Item -LiteralPath $origem -Destination (Join-Path $PastaBackup $a) -Force }
    }
}

function Restore-Backup {
    if (-not (Test-Path -LiteralPath $PastaBackup)) { return }
    Get-ChildItem -LiteralPath $PastaBackup -File | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $Dados $_.Name) -Force
    }
    Write-Aviso "Arquivos anteriores restaurados de $PastaBackup"
}

# --------------------------------------------------------------------------
# Fluxo principal
# --------------------------------------------------------------------------
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $ArquivoLog) | Out-Null
try { Start-Transcript -Path $ArquivoLog | Out-Null } catch { }

$conexao = $null
$arquivosTrocados = $false
$codigoSaida = 0
Push-Location $Raiz
try {
    Write-Host ''
    Write-Host 'Atualização de dados do CAPEX Dashboard a partir do Power BI' -ForegroundColor White
    Write-Host "Repositório: $Raiz"

    foreach ($q in $Consultas) {
        if (-not (Test-Path -LiteralPath (Join-Path $Dados $q.Dax))) { throw "Consulta não encontrada: public\data\$($q.Dax)" }
    }

    # Cenário fixo nas consultas (ex.: BGQ3) -- lembrete para a virada de ciclo
    $cenarios = @($Consultas | ForEach-Object {
            $t = [IO.File]::ReadAllText((Join-Path $Dados $_.Dax), [Text.Encoding]::UTF8)
            [regex]::Matches($t, '"(BG\s*Q\d)"') | ForEach-Object { $_.Groups[1].Value }
        } | Sort-Object -Unique)

    Write-Etapa 'Localizando o Power BI Desktop aberto'
    $alvo = Select-InstanciaPbi
    Write-Ok "Arquivo: $($alvo.Arquivo)  (localhost:$($alvo.Porta))"

    $dll = Import-Adomd $alvo.ExePbi
    Write-Info "Cliente ADOMD: $dll"

    $conexao = New-Object Microsoft.AnalysisServices.AdomdClient.AdomdConnection("Data Source=localhost:$($alvo.Porta);")
    $conexao.Open()
    try {
        $catalogos = $conexao.GetSchemaDataSet('DBSCHEMA_CATALOGS', $null)
        if ($catalogos.Tables[0].Rows.Count -gt 0) { $conexao.ChangeDatabase([string]$catalogos.Tables[0].Rows[0]['CATALOG_NAME']) }
    } catch { }

    $ultima = Get-UltimaAtualizacaoModelo $conexao
    if ($ultima) {
        Write-Info ("Última atualização do modelo: {0:dd/MM/yyyy HH:mm}" -f $ultima)
        if (((Get-Date) - $ultima).TotalHours -gt 24) {
            Write-Aviso 'O modelo foi atualizado há mais de 24h. Considere clicar em "Atualizar" no Power BI antes.'
            if (-not (Confirmar 'Continuar com esses dados?' $false)) { throw 'Cancelado: modelo desatualizado.' }
        }
    }
    if ($cenarios.Count -gt 0) { Write-Info "Cenário fixo nas consultas: $($cenarios -join ', ')  (revisar na virada de ciclo)" }

    Write-Etapa 'Executando consultas DAX'
    New-Item -ItemType Directory -Force -Path $PastaTemp | Out-Null
    $resumo = New-Object System.Collections.ArrayList
    $precisaConfirmar = $false

    foreach ($q in $Consultas) {
        $cronometro = [Diagnostics.Stopwatch]::StartNew()
        $destinoTemp = Join-Path $PastaTemp $q.Csv
        try {
            $res = Export-DaxParaCsv $conexao (Join-Path $Dados $q.Dax) $destinoTemp
        } catch {
            throw "Falha na consulta $($q.Dax): $($_.Exception.GetBaseException().Message)"
        }
        $cronometro.Stop()

        $atual = Join-Path $Dados $q.Csv
        $linhasAntes = Get-QtdLinhasCsv $atual
        $cabecalhoAntes = Get-CabecalhoCsv $atual

        if ($res.Linhas -eq 0) { throw "$($q.Dax) não retornou nenhuma linha. Nada foi alterado." }

        if ($cabecalhoAntes -and $cabecalhoAntes -ne $res.Cabecalho) {
            $msg = "Colunas de $($q.Csv) mudaram.`n      antes: $cabecalhoAntes`n      agora: $($res.Cabecalho)"
            if (-not $AceitarMudancaDeColunas) { throw "$msg`n    Rode com -AceitarMudancaDeColunas se a mudança for intencional." }
            Write-Aviso $msg
        }

        $variacao = ''
        if ($linhasAntes) {
            $delta = ($res.Linhas - $linhasAntes) / [double]$linhasAntes
            $variacao = '{0:+0.0%;-0.0%;0.0%}' -f $delta
            if ($delta -lt (-1 * $LimiteQuedaLinhas)) {
                Write-Aviso ("{0}: queda de {1:0%} nas linhas ({2} -> {3})." -f $q.Csv, (-1 * $delta), $linhasAntes, $res.Linhas)
                $precisaConfirmar = $true
            }
        }
        [void]$resumo.Add([pscustomobject]@{
                Arquivo = $q.Csv
                Antes   = $linhasAntes
                Agora   = $res.Linhas
                Var     = $variacao
                Tempo   = ('{0:0.0}s' -f $cronometro.Elapsed.TotalSeconds)
            })
        Write-Ok ("{0,-30} {1,7} linhas  ({2:0.0}s)" -f $q.Csv, $res.Linhas, $cronometro.Elapsed.TotalSeconds)
    }
    $conexao.Close(); $conexao = $null

    Write-Host ''
    $resumo | Format-Table -AutoSize | Out-String | Write-Host

    if ($precisaConfirmar -and -not (Confirmar 'Houve queda grande de linhas. Continuar mesmo assim?' $false)) {
        throw 'Cancelado pelo usuário. Nada foi alterado em public\data.'
    }

    Write-Etapa 'Substituindo CSVs em public\data (com backup)'
    Save-Backup
    $arquivosTrocados = $true
    foreach ($q in $Consultas) {
        Copy-Item -LiteralPath (Join-Path $PastaTemp $q.Csv) -Destination (Join-Path $Dados $q.Csv) -Force
    }
    Write-Ok "Backup em $PastaBackup"

    Write-Etapa 'Processando dados (npm run process-data)'
    Invoke-Externo 'npm.cmd' @('run', 'process-data')

    if (-not $PularValidacao) {
        Write-Etapa 'Validando métricas (npm run validate-data)'
        & npm.cmd run validate-data
        if ($LASTEXITCODE -ne 0) {
            Write-Aviso 'A validação apontou divergências (ver acima).'
            if (-not (Confirmar 'Publicar mesmo assim?' $false)) { throw 'Validação reprovada.' }
        }
    }

    if ($RodarTestes) {
        Write-Etapa 'Rodando testes (npm run verify)'
        Invoke-Externo 'npm.cmd' @('run', 'verify')
    }

    # A partir daqui os arquivos novos ficam, mesmo que a publicação falhe
    $arquivosTrocados = $false

    $caminhosDados = @($Consultas | ForEach-Object { "public/data/$($_.Csv)" })
    foreach ($g in $Gerados) {
        if (Test-GitRastreado "public/data/$g") { $caminhosDados += "public/data/$g" }
    }
    $caminhosProcesso = @()
    if (-not $SomenteDados) {
        $caminhosProcesso = @($ArquivosProcesso | Where-Object { Test-Path -LiteralPath (Join-Path $Raiz $_) })
    }
    $caminhosCommit = @($caminhosDados) + @($caminhosProcesso)

    switch ($Publicar) {
        'Nenhum' {
            Write-Etapa 'Publicação desativada (-Publicar Nenhum)'
            Write-Info 'Arquivos atualizados localmente. Rode "npm run dev" para conferir.'
        }
        'Git' {
            Write-Etapa 'Publicando via GitHub (deploy automático na Vercel)'
            $branch = (& git rev-parse --abbrev-ref HEAD).Trim()
            Invoke-Externo 'git' (@('add', '--') + $caminhosCommit)
            & git diff --cached --quiet -- @caminhosCommit
            if ($LASTEXITCODE -eq 0) {
                Write-Ok 'Nada mudou desde a última publicação. Nada a enviar.'
                break
            }
            Write-Info 'Dados:'
            & git diff --cached --stat -- @caminhosDados
            $processoAlterado = @()
            if ($caminhosProcesso.Count -gt 0) {
                $processoAlterado = @(& git diff --cached --name-only -- @caminhosProcesso | Where-Object { $_ })
            }
            if ($processoAlterado.Count -gt 0) {
                Write-Info 'Arquivos do processo de atualização (também entram no commit):'
                & git diff --cached --stat -- @caminhosProcesso
                Write-Info '(use -SomenteDados para enviar só os dados)'
            }

            if ($branch -ne 'main') {
                Write-Aviso "Você está na branch '$branch'. O push gera um deploy de PREVIEW na Vercel, não o de produção."
            }
            if (-not (Confirmar "Fazer commit e push para origin/${branch}?")) {
                Write-Info 'Commit não feito. Os arquivos ficaram atualizados (e em stage) localmente.'
                break
            }
            $rotuloCenario = ''
            if ($cenarios.Count -gt 0) { $rotuloCenario = " ($($cenarios -join ', '))" }
            $mensagem = "dados: atualização do BI em $(Get-Date -Format 'dd/MM/yyyy HH:mm')$rotuloCenario"
            $detalhe = ($resumo | ForEach-Object { "- $($_.Arquivo): $($_.Agora) linhas" }) -join "`n"
            if ($processoAlterado.Count -gt 0) {
                $detalhe += "`n`nProcesso de atualização:`n" + (($processoAlterado | ForEach-Object { "- $_" }) -join "`n")
            }
            Invoke-Externo 'git' (@('commit', '-m', $mensagem, '-m', $detalhe, '--') + $caminhosCommit)
            Invoke-Externo 'git' @('push', 'origin', 'HEAD')
            Write-Ok "Enviado para origin/$branch. Acompanhe o deploy no painel da Vercel."
        }
        'Vercel' {
            Write-Etapa 'Publicando direto na Vercel (vercel deploy --prod)'
            if (-not (Confirmar 'Publicar em PRODUÇÃO na Vercel a partir desta pasta?')) {
                Write-Info 'Deploy não feito. Os arquivos ficaram atualizados localmente.'
                break
            }
            Invoke-Externo 'npx.cmd' @('--yes', 'vercel', 'deploy', '--prod')
        }
    }

    Write-Host ''
    Write-Host 'Concluído.' -ForegroundColor Green
} catch {
    $codigoSaida = 1
    Write-Host ''
    Write-Host "ERRO: $($_.Exception.Message)" -ForegroundColor Red
    if ($arquivosTrocados) { Restore-Backup }
} finally {
    if ($conexao) { try { $conexao.Close() } catch { } }
    if (Test-Path -LiteralPath $PastaTemp) { Remove-Item -LiteralPath $PastaTemp -Recurse -Force -ErrorAction SilentlyContinue }
    Pop-Location
    Write-Host "Log: $ArquivoLog"
    try { Stop-Transcript | Out-Null } catch { }
}
exit $codigoSaida
