import { useMemo } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell,
} from "recharts";
import type { ProjetoMetricas } from "../types";
import { fmtBRL } from "../lib/format";

const RISK_COLORS: Record<string, string> = {
  "Estouro": "#C0392B",
  "Risco de Não Realização": "#E0672E",
  "Revisão de Fluxo de Caixa": "#5B7FDE",
  "Normal": "#2A9D6F",
  "Dados insuficientes": "#475569",
};

const chartTooltipStyle = {
  contentStyle: { background: "#16202F", border: "1px solid #22304A", borderRadius: 8, fontSize: 12, color: "#E6EAF2" },
  labelStyle: { color: "#8CA0BF" },
};

export function DistribuicaoFinanceiraPlataforma({ lista }: { lista: ProjetoMetricas[] }) {
  const porPlataforma = useMemo(() => {
    const map = new Map<string, { plataforma: string; orcamento: number; executado: number; compromisso: number; aEmitir: number }>();
    for (const p of lista) {
      const cur = map.get(p.n4Curta) ?? { plataforma: p.n4Curta, orcamento: 0, executado: 0, compromisso: 0, aEmitir: 0 };
      cur.orcamento += p.orcamentoPeriodo ?? 0;
      cur.executado += p.executado ?? 0;
      cur.compromisso += p.compromisso ?? 0;
      cur.aEmitir += Math.max(p.aEmitir ?? 0, 0);
      map.set(p.n4Curta, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.orcamento - a.orcamento);
  }, [lista]);

  // Barra 100% empilhada: Realizado + Comprometido + A Emitir = Orçamento (por construção da fórmula).
  const composicao = useMemo(
    () =>
      porPlataforma.map((p) => {
        const realizadoLista = lista.filter((x) => x.n4Curta === p.plataforma);
        const realizado = realizadoLista.reduce((a, x) => a + (x.realizadoPeriodo ?? 0), 0);
        return {
          plataforma: p.plataforma,
          orcamento: p.orcamento,
          pctRealizado: p.orcamento > 0 ? (realizado / p.orcamento) * 100 : 0,
          pctComprometido: p.orcamento > 0 ? (p.compromisso / p.orcamento) * 100 : 0,
          pctAEmitir: p.orcamento > 0 ? (p.aEmitir / p.orcamento) * 100 : 0,
        };
      }),
    [porPlataforma, lista]
  );

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div>
        <p className="text-xs font-semibold text-text-muted mb-2">Orçamento × Executado × Emitido × A Emitir (R$)</p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={porPlataforma} layout="vertical" margin={{ left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#22304A" horizontal={false} />
            <XAxis type="number" tickFormatter={(v) => fmtBRL(v, true)} stroke="#8CA0BF" fontSize={11} />
            <YAxis type="category" dataKey="plataforma" stroke="#8CA0BF" fontSize={11} width={130} />
            <Tooltip formatter={(v: any) => fmtBRL(Number(v))} {...chartTooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="orcamento" name="Orçamento" fill="#3DA5F4" radius={[0, 4, 4, 0]} />
            <Bar dataKey="executado" name="Executado" fill="#7FD1B9" radius={[0, 4, 4, 0]} />
            <Bar dataKey="compromisso" name="Emitido" fill="#E0B429" radius={[0, 4, 4, 0]} />
            <Bar dataKey="aEmitir" name="A Emitir" fill="#E0672E" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div>
        <p className="text-xs font-semibold text-text-muted mb-2">Composição do Orçamento por Plataforma (%)</p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={composicao} layout="vertical" margin={{ left: 20 }} stackOffset="expand">
            <CartesianGrid strokeDasharray="3 3" stroke="#22304A" horizontal={false} />
            <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} stroke="#8CA0BF" fontSize={11} />
            <YAxis type="category" dataKey="plataforma" stroke="#8CA0BF" fontSize={11} width={130} />
            <Tooltip formatter={(v: any) => `${Number(v).toFixed(0)}%`} {...chartTooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="pctRealizado" name="Executado" stackId="a" fill="#7FD1B9" />
            <Bar dataKey="pctComprometido" name="Emitido" stackId="a" fill="#E0B429" />
            <Bar dataKey="pctAEmitir" name="A Emitir" stackId="a" fill="#E0672E" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <p className="text-[11px] text-text-faint mt-1">Cada barra soma 100% do orçamento do período da plataforma.</p>
      </div>
    </div>
  );
}

export function StatusDistribution({ lista }: { lista: ProjetoMetricas[] }) {
  const distribuicaoStatus = useMemo(() => {
    const statuses: ProjetoMetricas["status"][] = ["Estouro", "Risco de Não Realização", "Revisão de Fluxo de Caixa", "Normal"];
    return statuses
      .map((s) => ({ status: s, qtd: lista.filter((p) => p.status === s).length, valor: lista.filter((p) => p.status === s).reduce((a, p) => a + (p.orcamentoPeriodo ?? 0), 0) }))
      .filter((s) => s.qtd > 0);
  }, [lista]);

  return (
    <div>
      <p className="text-xs font-semibold text-text-muted mb-2">Distribuição de Status (nº e valor)</p>
      <div className="grid grid-cols-2 h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={distribuicaoStatus} dataKey="qtd" nameKey="status" cx="50%" cy="50%" innerRadius={40} outerRadius={70} label={(e: any) => e.qtd}>
              {distribuicaoStatus.map((d) => <Cell key={d.status} fill={RISK_COLORS[d.status]} />)}
            </Pie>
            <Tooltip {...chartTooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={distribuicaoStatus} dataKey="valor" nameKey="status" cx="50%" cy="50%" innerRadius={40} outerRadius={70} label={(e: any) => fmtBRL(e.valor, true)}>
              {distribuicaoStatus.map((d) => <Cell key={d.status} fill={RISK_COLORS[d.status]} />)}
            </Pie>
            <Tooltip formatter={(v: any) => fmtBRL(Number(v))} {...chartTooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-3 justify-center text-[11px] text-text-muted mt-1">
        {distribuicaoStatus.map((d) => (
          <span key={d.status} className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: RISK_COLORS[d.status] }} />
            {d.status} ({d.qtd})
          </span>
        ))}
      </div>
    </div>
  );
}
