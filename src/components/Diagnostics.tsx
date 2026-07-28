import { useMemo } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line, ScatterChart, Scatter, ZAxis, ReferenceLine, PieChart, Pie, Cell,
} from "recharts";
import type { Periodo, ProjetoMetricas } from "../types";
import { Card, SectionHeader } from "./ui/primitives";
import { fmtBRL, fmtPct } from "../lib/format";

const RISK_COLORS: Record<string, string> = {
  "Estouro": "#C0392B",
  "Baixo comprometimento": "#E0672E",
  "Baixa execução": "#E0B429",
  "OK": "#2A9D6F",
  "Dados insuficientes": "#64748b",
};

const chartTooltipStyle = {
  contentStyle: { background: "#16202F", border: "1px solid #22304A", borderRadius: 8, fontSize: 12, color: "#E6EAF2" },
  labelStyle: { color: "#8CA0BF" },
};

export function Diagnostics({ lista, periodo }: { lista: ProjetoMetricas[]; periodo: Periodo }) {
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

  const evolucaoMensal = useMemo(() => {
    // Reconstrói série mensal só é possível com dados de "Orçamento" (h1/h2 agregados);
    // aproxima por semestre já que o dataset consolidado não guarda os 12 meses individualmente aqui.
    return [
      { periodo: "1º Semestre", orcamento: sum(lista, (p) => p.h1_2026), executado: null },
      { periodo: "2º Semestre", orcamento: sum(lista, (p) => p.h2_2026), executado: null },
    ];
  }, [lista]);

  const matrizRisco = useMemo(
    () =>
      lista
        .filter((p) => p.pctExecucao !== null && p.pctComprometimento !== null && p.orcamentoPeriodo)
        .map((p) => ({
          nome: p.nome,
          plataforma: p.n4Curta,
          gestor: p.gestor ?? "—",
          x: (p.pctExecucao ?? 0) * 100,
          y: (p.pctComprometimento ?? 0) * 100,
          z: p.orcamentoPeriodo ?? 0,
          status: p.status,
        })),
    [lista]
  );

  const distribuicaoStatus = useMemo(() => {
    const statuses: ProjetoMetricas["status"][] = ["Estouro", "Baixo comprometimento", "Baixa execução", "OK", "Dados insuficientes"];
    return statuses
      .map((s) => ({
        status: s,
        qtd: lista.filter((p) => p.status === s).length,
        valor: sum(lista.filter((p) => p.status === s), (p) => p.orcamentoPeriodo),
      }))
      .filter((s) => s.qtd > 0);
  }, [lista]);

  return (
    <div className="mb-6">
      <SectionHeader title="Diagnóstico" tooltip="Comparativos de orçamento, execução, comprometimento e risco por plataforma e projeto." />

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <Card>
          <p className="text-xs font-semibold text-text-muted mb-2">Comparação por Plataforma</p>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={porPlataforma} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#22304A" horizontal={false} />
              <XAxis type="number" tickFormatter={(v) => fmtBRL(v, true)} stroke="#8CA0BF" fontSize={11} />
              <YAxis type="category" dataKey="plataforma" stroke="#8CA0BF" fontSize={11} width={140} />
              <Tooltip formatter={(v: any) => fmtBRL(Number(v))} {...chartTooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="orcamento" name="Orçamento" fill="#3DA5F4" radius={[0, 4, 4, 0]} />
              <Bar dataKey="executado" name="Executado" fill="#7FD1B9" radius={[0, 4, 4, 0]} />
              <Bar dataKey="compromisso" name="Compromisso" fill="#E0B429" radius={[0, 4, 4, 0]} />
              <Bar dataKey="aEmitir" name="A Emitir" fill="#E0672E" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <p className="text-xs font-semibold text-text-muted mb-2">
            Evolução {periodo === "Todos" ? "por Período (2026 vs 2027 no eixo)" : "Semestral 2026"}
          </p>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={evolucaoMensal}>
              <CartesianGrid strokeDasharray="3 3" stroke="#22304A" />
              <XAxis dataKey="periodo" stroke="#8CA0BF" fontSize={11} />
              <YAxis tickFormatter={(v) => fmtBRL(v, true)} stroke="#8CA0BF" fontSize={11} />
              <Tooltip formatter={(v: any) => fmtBRL(Number(v))} {...chartTooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="orcamento" name="Orçamento" stroke="#3DA5F4" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-[11px] text-text-faint mt-1">
            * A planilha de origem não guarda o realizado mês a mês de forma agregável sem reprocessar a aba "Orçamento" em detalhe; aqui exibimos a distribuição orçamentária H1×H2 de 2026 disponível no dataset consolidado.
          </p>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <Card>
          <p className="text-xs font-semibold text-text-muted mb-2">Progresso por Plataforma (%)</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={progressoPlataforma}>
              <CartesianGrid strokeDasharray="3 3" stroke="#22304A" />
              <XAxis dataKey="plataforma" stroke="#8CA0BF" fontSize={10} interval={0} angle={-15} textAnchor="end" height={60} />
              <YAxis tickFormatter={(v) => `${v}%`} stroke="#8CA0BF" fontSize={11} />
              <Tooltip formatter={(v: any) => `${Number(v).toFixed(1)}%`} {...chartTooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="pctExecucao" name="% Execução" fill="#7FD1B9" radius={[4, 4, 0, 0]} />
              <Bar dataKey="pctComprometimento" name="% Comprometimento" fill="#E0B429" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <p className="text-xs font-semibold text-text-muted mb-2">Distribuição de Status (nº e valor)</p>
          <div className="grid grid-cols-2 h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={distribuicaoStatus} dataKey="qtd" nameKey="status" cx="50%" cy="50%" innerRadius={45} outerRadius={80} label={(e: any) => e.qtd}>
                  {distribuicaoStatus.map((d) => <Cell key={d.status} fill={RISK_COLORS[d.status]} />)}
                </Pie>
                <Tooltip {...chartTooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={distribuicaoStatus} dataKey="valor" nameKey="status" cx="50%" cy="50%" innerRadius={45} outerRadius={80} label={(e: any) => fmtBRL(e.valor, true)}>
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
        </Card>
      </div>

      <Card>
        <p className="text-xs font-semibold text-text-muted mb-2">Matriz de Risco — Execução × Comprometimento</p>
        <ResponsiveContainer width="100%" height={340}>
          <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#22304A" />
            <XAxis type="number" dataKey="x" name="% Execução" unit="%" domain={[0, 100]} stroke="#8CA0BF" fontSize={11} />
            <YAxis type="number" dataKey="y" name="% Comprometimento" unit="%" domain={[0, 100]} stroke="#8CA0BF" fontSize={11} />
            <ZAxis type="number" dataKey="z" range={[40, 400]} name="Orçamento" />
            <ReferenceLine x={40} stroke="#E0B429" strokeDasharray="4 4" />
            <ReferenceLine y={80} stroke="#E0672E" strokeDasharray="4 4" />
            <Tooltip cursor={{ strokeDasharray: "3 3" }} content={<RiskMatrixTooltip />} />
            {(["Estouro", "Baixo comprometimento", "Baixa execução", "OK", "Dados insuficientes"] as const).map((s) => (
              <Scatter key={s} name={s} data={matrizRisco.filter((d) => d.status === s)} fill={RISK_COLORS[s]} fillOpacity={0.75} />
            ))}
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </ScatterChart>
        </ResponsiveContainer>
      </Card>
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
      <p>Status: {d.status}</p>
    </div>
  );
}

function sum(lista: ProjetoMetricas[], fn: (p: ProjetoMetricas) => number | null): number {
  return lista.reduce((a, p) => a + (fn(p) ?? 0), 0);
}
