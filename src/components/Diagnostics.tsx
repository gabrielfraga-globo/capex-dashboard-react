import { useMemo } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell,
} from "recharts";
import type { ProjetoMetricas } from "../types";
import { fmtBRL } from "../lib/format";

const RISK_COLORS: Record<string, string> = {
  "Estouro": "#C0392B",
  "Baixo comprometimento": "#E0672E",
  "Baixa execução": "#E0B429",
  "OK": "#2A9D6F",
  "Dados insuficientes": "#475569",
};

const chartTooltipStyle = {
  contentStyle: { background: "#16202F", border: "1px solid #22304A", borderRadius: 8, fontSize: 12, color: "#E6EAF2" },
  labelStyle: { color: "#8CA0BF" },
};

export function PlataformasEmAtencao({ lista }: { lista: ProjetoMetricas[] }) {
  const porPlataforma = useMemo(() => {
    const map = new Map<string, { plataforma: string; orcamento: number; executado: number; compromisso: number; aEmitir: number }>();
    for (const p of lista) {
      const cur = map.get(p.n4Curta) ?? { plataforma: p.n4Curta, orcamento: 0, executado: 0, compromisso: 0, aEmitir: 0 };
      cur.orcamento += p.orcamentoPeriodo ?? 0;
      cur.executado += p.executado ?? 0;
      cur.compromisso += p.compromisso ?? 0;
      cur.aEmitir += p.aEmitir ?? 0;
      map.set(p.n4Curta, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.orcamento - a.orcamento);
  }, [lista]);

  const progressoPlataforma = useMemo(
    () =>
      porPlataforma.map((p) => ({
        plataforma: p.plataforma,
        pctExecucao: p.orcamento > 0 ? (p.executado / p.orcamento) * 100 : 0,
        pctComprometimento: p.orcamento > 0 ? (p.compromisso / p.orcamento) * 100 : 0,
      })),
    [porPlataforma]
  );

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div>
        <p className="text-xs font-semibold text-text-muted mb-2">Orçamento × Executado × Compromisso × A Emitir</p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={porPlataforma} layout="vertical" margin={{ left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#22304A" horizontal={false} />
            <XAxis type="number" tickFormatter={(v) => fmtBRL(v, true)} stroke="#8CA0BF" fontSize={11} />
            <YAxis type="category" dataKey="plataforma" stroke="#8CA0BF" fontSize={11} width={130} />
            <Tooltip formatter={(v: any) => fmtBRL(Number(v))} {...chartTooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="orcamento" name="Orçamento" fill="#3DA5F4" radius={[0, 4, 4, 0]} />
            <Bar dataKey="executado" name="Executado" fill="#7FD1B9" radius={[0, 4, 4, 0]} />
            <Bar dataKey="compromisso" name="Compromisso" fill="#E0B429" radius={[0, 4, 4, 0]} />
            <Bar dataKey="aEmitir" name="A Emitir" fill="#E0672E" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div>
        <p className="text-xs font-semibold text-text-muted mb-2">Progresso por Plataforma (%)</p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={progressoPlataforma}>
            <CartesianGrid strokeDasharray="3 3" stroke="#22304A" />
            <XAxis dataKey="plataforma" stroke="#8CA0BF" fontSize={10} interval={0} angle={-15} textAnchor="end" height={55} />
            <YAxis tickFormatter={(v) => `${v}%`} stroke="#8CA0BF" fontSize={11} />
            <Tooltip formatter={(v: any) => `${Number(v).toFixed(1)}%`} {...chartTooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="pctExecucao" name="% Execução" fill="#7FD1B9" radius={[4, 4, 0, 0]} />
            <Bar dataKey="pctComprometimento" name="% Comprometimento" fill="#E0B429" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function StatusDistribution({ lista }: { lista: ProjetoMetricas[] }) {
  const distribuicaoStatus = useMemo(() => {
    const statuses: ProjetoMetricas["status"][] = ["Estouro", "Baixo comprometimento", "Baixa execução", "OK"];
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
