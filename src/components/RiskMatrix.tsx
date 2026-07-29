import { useMemo } from "react";
import {
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ReferenceLine, Legend,
} from "recharts";
import type { ProjetoMetricas } from "../types";
import { fmtBRL, fmtPct } from "../lib/format";
import { SectionHeader } from "./ui/primitives";

const RISK_COLORS: Record<string, string> = {
  "Estouro": "#C0392B",
  "Baixo comprometimento": "#E0672E",
  "Baixa execução": "#E0B429",
  "OK": "#2A9D6F",
  "Dados insuficientes": "#475569",
};

export function RiskMatrix({ lista, onSelect }: { lista: ProjetoMetricas[]; onSelect: (p: ProjetoMetricas) => void }) {
  const data = useMemo(
    () =>
      lista
        .filter((p) => p.pctExecucao !== null && p.pctComprometimento !== null && p.orcamentoPeriodo)
        .map((p) => ({
          id: p.id, nome: p.nome, plataforma: p.n4Curta, gestor: p.gestor ?? "—",
          x: (p.pctExecucao ?? 0) * 100, y: (p.pctComprometimento ?? 0) * 100, z: p.orcamentoPeriodo ?? 0,
          status: p.status, projeto: p,
        })),
    [lista]
  );

  return (
    <div className="rounded-card border border-accent/30 bg-gradient-to-b from-card-alt to-card shadow-card p-4 mb-5">
      <SectionHeader
        title="Matriz de Risco — Execução × Comprometimento"
        tooltip="Cada ponto é um projeto. Quanto mais à esquerda e mais para cima, maior o risco. Clique num ponto para ver o detalhe."
      />
      <ResponsiveContainer width="100%" height={400}>
        <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#22304A" />
          <XAxis type="number" dataKey="x" name="% Execução" unit="%" domain={[0, 100]} stroke="#8CA0BF" fontSize={11} />
          <YAxis type="number" dataKey="y" name="% Comprometimento" unit="%" domain={[0, 100]} stroke="#8CA0BF" fontSize={11} />
          <ZAxis type="number" dataKey="z" range={[40, 500]} name="Orçamento" />
          <ReferenceLine x={40} stroke="#E0B429" strokeDasharray="4 4" />
          <ReferenceLine y={80} stroke="#E0672E" strokeDasharray="4 4" />
          <Tooltip cursor={{ strokeDasharray: "3 3" }} content={<RiskMatrixTooltip />} />
          {(["Estouro", "Baixo comprometimento", "Baixa execução", "OK"] as const).map((s) => (
            <Scatter
              key={s}
              name={s}
              data={data.filter((d) => d.status === s)}
              fill={RISK_COLORS[s]}
              fillOpacity={0.8}
              onClick={(d: any) => onSelect(d.projeto)}
              cursor="pointer"
            />
          ))}
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

function RiskMatrixTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-card-alt px-3 py-2 text-xs text-text shadow-card">
      <p className="font-bold mb-1">{d.nome}</p>
      <p className="text-text-muted">{d.plataforma} · {d.gestor}</p>
      <p>% Execução: {fmtPct(d.x / 100)}</p>
      <p>% Comprometimento: {fmtPct(d.y / 100)}</p>
      <p>Orçamento: {fmtBRL(d.z)}</p>
    </div>
  );
}
