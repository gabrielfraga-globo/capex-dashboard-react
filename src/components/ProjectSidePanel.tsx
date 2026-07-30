import { SidePanel } from "./ui/sidepanel";
import { RiskBadge, InfoTooltip } from "./ui/primitives";
import { fmtBRL, fmtPct } from "../lib/format";
import type { ProjetoMetricas } from "../types";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";

function Field({ label, value, tooltip }: { label: string; value: string; tooltip?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border-subtle text-sm">
      <span className="text-text-muted flex items-center gap-1">
        {label}
        {tooltip && <InfoTooltip text={tooltip} />}
      </span>
      <span className="text-text font-medium">{value}</span>
    </div>
  );
}

export function ProjectSidePanel({
  projeto,
  comparaveis,
  onClose,
}: {
  projeto: ProjetoMetricas | null;
  comparaveis: ProjetoMetricas[];
  onClose: () => void;
}) {
  if (!projeto) return null;

  const comparacaoAnual = [
    { ano: "2026", orcamento: projeto.orcamento2026 ?? 0, executado: (projeto.realizado2026 ?? 0) + (projeto.emPagamento2026 ?? 0) },
    { ano: "2027", orcamento: projeto.orcamento2027 ?? 0, executado: (projeto.realizado2027 ?? 0) + (projeto.emPagamento2027 ?? 0) },
  ];

  return (
    <SidePanel open={!!projeto} onOpenChange={(v) => !v && onClose()} title={projeto.nome}>
      <div className="flex items-center gap-2 mb-4">
        <RiskBadge status={projeto.status} />
        <span className="text-xs text-text-muted">{projeto.n4Curta}</span>
      </div>

      <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">Dados Cadastrais</p>
      <Field label="Plataforma (N4)" value={projeto.n4} />
      <Field label="Gestor" value={projeto.gestor ?? "—"} />
      <Field label="E-mail do gestor" value={projeto.gestorEmail ?? "—"} />
      <Field label="1º Aprovador" value={projeto.aprovador ?? "—"} />

      <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mt-4 mb-1">Composição Financeira ({projeto.periodo === "Todos" ? "2026–2027" : projeto.periodo})</p>
      <Field label="Orçamento do período" value={fmtBRL(projeto.orcamentoPeriodo)} tooltip="Valor total aprovado para o período selecionado (2026, 2027, ou os dois juntos)." />
      <Field label="Orçamento plurianual" value={fmtBRL(projeto.orcamentoPlurianual)} tooltip="Valor total aprovado para o projeto somando todos os anos (2026 e 2027)." />
      <Field label="Executado" value={fmtBRL(projeto.executado)} tooltip="Valor que já foi efetivamente pago ou reconhecido como gasto no período (Realizado + Em Pagamento)." />
      <Field label="Emitido" value={fmtBRL(projeto.compromisso)} tooltip="Valor total já emitido (contrato/PO), não fracionado por ano" />
      <Field label="A Emitir" value={fmtBRL(projeto.aEmitir)} tooltip="Quanto ainda não tem contrato nem foi gasto. Orçamento − Executado − Emitido." />
      <Field label="% Execução" value={fmtPct(projeto.pctExecucao)} tooltip="Percentual do orçamento do período que já foi de fato gasto." />
      <Field label="% Emitido" value={fmtPct(projeto.pctComprometimento)} tooltip="Percentual do orçamento do período que já tem contrato ou pedido de compra emitido." />
      <Field label="Cobertura Financeira" value={fmtPct(projeto.coberturaFinanceira)} tooltip="Parcela do orçamento já com movimentação financeira: (Executado + Emitido) ÷ Orçamento." />
      <Field label="Desvio plurianual" value={fmtBRL(projeto.desvioPlurianual)} tooltip="Quanto o total já gasto e emitido ultrapassa (se positivo) o orçamento aprovado para todo o projeto." />
      <Field label="Participação no risco total" value={fmtPct(projeto.participacaoRisco)} tooltip="Peso deste projeto no risco financeiro de toda a carteira filtrada — quanto maior, mais prioritário." />
      <Field label="Ritmo necessário (por mês restante)" value={fmtBRL(projeto.ritmoNecessario)} tooltip="Quanto a área precisa emitir/gastar por mês, em média, para não deixar saldo parado até o fim do período." />

      <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mt-4 mb-2">Comparação 2026 × 2027</p>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={comparacaoAnual}>
          <CartesianGrid strokeDasharray="3 3" stroke="#22304A" />
          <XAxis dataKey="ano" stroke="#8CA0BF" fontSize={11} />
          <YAxis tickFormatter={(v) => fmtBRL(v, true)} stroke="#8CA0BF" fontSize={11} />
          <Tooltip
            formatter={(v: any) => fmtBRL(Number(v))}
            contentStyle={{ background: "#16202F", border: "1px solid #22304A", borderRadius: 8, fontSize: 12 }}
          />
          <Bar dataKey="orcamento" name="Orçamento" fill="#3DA5F4" radius={[4, 4, 0, 0]} />
          <Bar dataKey="executado" name="Executado" fill="#7FD1B9" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>

      <div className="mt-4 rounded-md border border-border bg-card-alt p-3 text-sm">
        <p className="text-text-muted text-xs uppercase font-semibold mb-1">Justificativa do Status</p>
        <p className="text-text">{projeto.acaoRecomendada}</p>
      </div>

      {comparaveis.length > 0 && (
        <>
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mt-4 mb-2">
            Projetos Comparáveis ({projeto.n4Curta})
          </p>
          <div className="space-y-1">
            {comparaveis.slice(0, 5).map((c) => (
              <div key={c.id} className="flex items-center justify-between text-xs py-1 border-b border-border-subtle">
                <span className="text-text truncate">{c.nome}</span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="text-text-muted">{fmtBRL(c.aEmitir, true)}</span>
                  <RiskBadge status={c.status} />
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </SidePanel>
  );
}
