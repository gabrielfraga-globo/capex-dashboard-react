import { useMemo, useState } from "react";
import type { ProjetoMetricas, RelatorioParsing } from "../types";
import { validarContraStatusReport } from "../lib/validation";
import { Card, SectionHeader } from "./ui/primitives";
import { fmtBRL } from "../lib/format";
import { ChevronDown, ChevronUp } from "lucide-react";

export function ValidationPanel({
  metricas2026,
  parsed,
  totalGeralProjetos,
}: {
  metricas2026: ProjetoMetricas[];
  parsed: RelatorioParsing;
  totalGeralProjetos: number;
}) {
  const [open, setOpen] = useState(false);
  const validacoes = useMemo(() => validarContraStatusReport(metricas2026, parsed), [metricas2026, parsed]);

  const semGestor = useMemo(
    () => Array.from(new Set(parsed.projetos.filter((p) => !p.gestor).map((p) => p.n4))),
    [parsed]
  );

  return (
    <Card className="mb-6">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between">
        <SectionHeader title="Área Técnica de Validação" tooltip="Compara os totais calculados pelo dashboard contra a aba Status Report da própria planilha, para 2026." />
        {open ? <ChevronUp size={16} className="text-text-muted" /> : <ChevronDown size={16} className="text-text-muted" />}
      </button>

      {open && (
        <div className="mt-2 space-y-4">
          {Object.keys(parsed.statusReportValores).length === 0 && (
            <p className="text-[11px] text-text-faint bg-card-alt rounded-md px-3 py-2">
              Esta planilha não tem a aba "Status Report" (formato de extração atual, sem
              tratamento). A validação abaixo fica sem referência externa — os valores
              calculados aqui já são auditáveis por si (ver "Realizado detalhado", quando
              presente) mas não há mais um segundo cálculo independente para comparar.
            </p>
          )}
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-text-muted uppercase text-[10px]">
                <th className="text-left py-1.5">Métrica</th>
                <th className="text-right py-1.5">Calculado</th>
                <th className="text-right py-1.5">Status Report</th>
                <th className="text-right py-1.5">Diferença</th>
                <th className="text-left py-1.5 pl-3">Situação</th>
                <th className="text-left py-1.5 pl-3">Possível Causa</th>
              </tr>
            </thead>
            <tbody>
              {validacoes.map((v) => (
                <tr key={v.metrica} className="border-b border-border-subtle">
                  <td className="py-1.5 text-text">{v.metrica}</td>
                  <td className="py-1.5 text-right text-text">{fmtBRL(v.valorCalculado)}</td>
                  <td className="py-1.5 text-right text-text-muted">{v.valorStatusReport !== null ? fmtBRL(v.valorStatusReport) : "—"}</td>
                  <td className="py-1.5 text-right text-text-muted">{v.diferenca !== null ? fmtBRL(v.diferenca) : "—"}</td>
                  <td className="py-1.5 pl-3">
                    <span className={
                      v.situacao === "OK" ? "text-risk-baixo font-semibold" :
                      v.situacao === "Divergência" ? "text-risk-alto font-semibold" : "text-text-faint"
                    }>
                      {v.situacao}
                    </span>
                  </td>
                  <td className="py-1.5 pl-3 text-text-faint">{v.causaProvavel}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="grid md:grid-cols-2 gap-3 text-xs">
            <div className="rounded-md border border-border bg-card-alt p-3">
              <p className="text-text-muted uppercase font-semibold mb-1">Cobertura de Dados</p>
              <p className="text-text">Projetos processados: <b>{totalGeralProjetos}</b></p>
              <p className="text-text">Linhas ignoradas: <b>{parsed.linhasIgnoradas.length}</b></p>
              <p className="text-text">Projetos só em Orçamento: <b>{parsed.projetosSoOrcamento.length}</b></p>
              <p className="text-text">Projetos só em Realizado: <b>{parsed.projetosSoRealizado.length}</b></p>
              <p className="text-text">Plataformas sem gestor: <b>{semGestor.length === 0 ? "nenhuma" : semGestor.join(", ")}</b></p>
            </div>
            <div className="rounded-md border border-border bg-card-alt p-3 max-h-40 overflow-y-auto">
              <p className="text-text-muted uppercase font-semibold mb-1">Linhas Ignoradas (amostra)</p>
              {parsed.linhasIgnoradas.length === 0 ? (
                <p className="text-text-faint">Nenhuma linha ignorada nesta planilha.</p>
              ) : (
                parsed.linhasIgnoradas.slice(0, 20).map((l, i) => (
                  <p key={i} className="text-text-faint">
                    <b>{l.aba}</b>: {l.motivo} — {l.contexto}
                  </p>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
