import { useMemo } from "react";
import type { SaldoIdentityError, SaldoProjetosSection, SaldoReconcileCheck } from "../radar/types";
import type { ProjetoBase } from "../../types";
import { Card } from "../../components/ui/primitives";
import { fmtBRL } from "../../lib/format";

const TOP_N = 10;

function Status({ ok }: { ok: boolean }) {
  return <span className={ok ? "text-risk-baixo" : "text-risk-critico"}>{ok ? "OK" : "Divergente"}</span>;
}

function TabelaChecks({ titulo, linhas }: { titulo: string; linhas: SaldoReconcileCheck[] }) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold text-text-muted">{titulo}</div>
      {linhas.length === 0 ? (
        <div className="text-xs text-text-faint">Nenhum item.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs tabular-nums">
            <thead>
              <tr className="text-text-faint">
                <th className="px-2 py-1 text-left font-medium">Verificação</th>
                <th className="px-2 py-1 text-right font-medium">Saldo</th>
                <th className="px-2 py-1 text-right font-medium">Carteira</th>
                <th className="px-2 py-1 text-right font-medium">Delta</th>
                <th className="px-2 py-1 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((c) => (
                <tr key={c.label} className="border-t border-border/40 text-text">
                  <td className="px-2 py-1 text-left">{c.label}</td>
                  <td className={`px-2 py-1 text-right ${c.saldo < 0 ? "text-risk-critico" : ""}`}>{fmtBRL(c.saldo)}</td>
                  <td className={`px-2 py-1 text-right ${c.carteira < 0 ? "text-risk-critico" : ""}`}>{fmtBRL(c.carteira)}</td>
                  <td className={`px-2 py-1 text-right ${c.delta < 0 ? "text-risk-critico" : ""}`}>{fmtBRL(c.delta)}</td>
                  <td className="px-2 py-1 text-left"><Status ok={c.ok} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export interface SaldoAuditPanelProps {
  section: SaldoProjetosSection;
  projetos: ProjetoBase[];
}

export function SaldoAuditPanel({ section, projetos }: SaldoAuditPanelProps) {
  const topDivergencias = useMemo(() => {
    const oficialPorProjeto = new Map<string, number>();
    for (const l of section.linhas) {
      oficialPorProjeto.set(l.projectKey, (oficialPorProjeto.get(l.projectKey) ?? 0) + l.saldoDisponivel);
    }
    const projetoPorId = new Map(projetos.map((p) => [p.id, p]));
    const chaves = new Set<string>([...oficialPorProjeto.keys(), ...projetoPorId.keys()]);

    const linhas = Array.from(chaves).map((key) => {
      const p = projetoPorId.get(key);
      const derivado = (p?.orcamento2026 ?? 0) - (p?.realizado2026 ?? 0) - (p?.emPagamento2026 ?? 0) - (p?.compromisso ?? 0);
      const oficial = oficialPorProjeto.get(key) ?? 0;
      return { key, nome: p?.nome ?? key, oficial, derivado, diff: oficial - derivado };
    });
    return linhas.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, TOP_N);
  }, [section.linhas, projetos]);

  const { reconciliation: rec } = section;

  return (
    <Card>
      <div className="flex flex-col gap-5">
          <div className="text-xs text-text-muted">
            Ano de referência {rec.yearGuard.anoReferencia} · anos na fonte: {rec.yearGuard.anosNaFonte.join(", ") || "—"} ·{" "}
            <span className={rec.yearGuard.ok ? "text-risk-baixo" : "text-risk-critico"}>
              {rec.yearGuard.ok ? "Ano consistente" : "Ano divergente"}
            </span>
          </div>

          <TabelaChecks titulo="Conciliação com a carteira" linhas={rec.checks} />
          <TabelaChecks titulo="Avisos (informativos)" linhas={rec.warnings} />

          <div>
            <div className="mb-1 text-xs font-semibold text-text-muted">Erros de identidade por linha</div>
            {rec.identityErrors.length === 0 ? (
              <div className="text-xs text-text-faint">Nenhum erro de identidade.</div>
            ) : (
              <ul className="flex flex-col gap-1 text-xs tabular-nums">
                {rec.identityErrors.map((e: SaldoIdentityError, i) => (
                  <li key={`${e.projectKey}|${e.rubrica}|${e.rule}|${i}`} className="text-text">
                    <span className="text-text-muted">{e.projectKey} · {e.rubrica} · {e.rule}:</span> esperado {fmtBRL(e.expected)}, obtido {fmtBRL(e.actual)}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="text-xs text-text-muted">
            Projetos órfãos (sem cadastro na carteira): {rec.orphanProjects.count}
            {rec.orphanProjects.count > 0 && (
              <>
                {" "}· saldo disponível {fmtBRL(rec.orphanProjects.saldoDisponivel)} · {rec.orphanProjects.keys.join(", ")}
              </>
            )}
          </div>

          <div>
            <div className="mb-1 text-xs font-semibold text-text-muted">Top {TOP_N} divergências: saldo oficial × derivado da carteira</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs tabular-nums">
                <thead>
                  <tr className="text-text-faint">
                    <th className="px-2 py-1 text-left font-medium">Projeto</th>
                    <th className="px-2 py-1 text-right font-medium">Oficial</th>
                    <th className="px-2 py-1 text-right font-medium">Derivado</th>
                    <th className="px-2 py-1 text-right font-medium">Diferença</th>
                  </tr>
                </thead>
                <tbody>
                  {topDivergencias.map((d) => (
                    <tr key={d.key} className="border-t border-border/40 text-text">
                      <td className="px-2 py-1 text-left">{d.nome}</td>
                      <td className={`px-2 py-1 text-right ${d.oficial < 0 ? "text-risk-critico" : ""}`}>{fmtBRL(d.oficial)}</td>
                      <td className={`px-2 py-1 text-right ${d.derivado < 0 ? "text-risk-critico" : ""}`}>{fmtBRL(d.derivado)}</td>
                      <td className={`px-2 py-1 text-right ${d.diff < 0 ? "text-risk-critico" : ""}`}>{fmtBRL(d.diff)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-text-faint">
              A diferença esperada é próxima do compromisso legado (premissa).
            </p>
          </div>
      </div>
    </Card>
  );
}
