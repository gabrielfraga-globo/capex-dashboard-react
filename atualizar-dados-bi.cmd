@echo off
setlocal
chcp 65001 >nul
title Atualizar dados do CAPEX Dashboard a partir do Power BI

rem Atualiza public\data a partir do Power BI Desktop aberto e publica.
rem Uso: atualizar-dados-bi.cmd [-Publicar Git^|Vercel^|Nenhum] [-Pbix "nome"] [-Sim]
rem Detalhes: docs\atualizacao-dados-bi.md

cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\atualizar-dados-bi.ps1" %*
set "RC=%ERRORLEVEL%"

echo.
if "%RC%"=="0" (
  echo Finalizado sem erros.
) else (
  echo Finalizado com erro ^(codigo %RC%^). O log esta em .atualizacao-bi\logs
)
echo.
pause
exit /b %RC%
