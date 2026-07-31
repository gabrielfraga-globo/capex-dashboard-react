import { useMemo } from "react";
import {
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ReferenceLine, Legend,
} from "recharts";
import type { ProjetoMetricas } from "../types";
import { fmtBRL, fmtPct } from "../lib/format";
import { SectionHeader } from "./ui/primitives";
import { useThemeStore } from "../store/themeStore";
import { getChartColors } from "../lib/chartColors";

const RISK_COLORS: Record<string, string> = {
  "Estouro": "#C0392B",
  "Risco de Não Realização": "#E0672E",
  "Revisão de Fluxo de Caixa": "#5B7FDE",
  "Normal": "#2A9D6F",
  "Dados insuficientes": "#475569",
};

// Piso de materialidade: abaixo disso, o orçamento é pequeno demais para o % ter
// significado visual (denominadores minúsculos geram percentuais de milhares de %,
// que distorcem a escala do gráfico inteiro). Esses projetos continuam contando
// normalmente em todos os KPIs, insights e tabelas — só não aparecem NESTE gráfico.
const PISO_MATERIALIDADE = 50_000;

// Limites usados nas outras regras de risco do dashboard (Baixo Comprometimento <80%,
// Baixa Execução <40%) — reaproveitados aqui para definir os quadrantes, mantendo uma
// única definição de "bom"/"ruim" em todo o produto.
const LIMIAR_COMPROMETIMENTO = 80;
const LIMIAR_EXECUCAO = 40;

export function RiskMatrix({ lista, onSelect }: { lista: ProjetoMetricas[]; onSelect: (p: ProjetoMetricas) => void }) {
  const { theme } = useThemeStore();
  const colors = getChartColors(theme);
  const { data, ocultos } = useMemo(() => {
    const elegiveis = lista.filter((p) => p.pctExecucao !== null && p.pctComprometimento !== null && p.orcamentoPeriodo);
    const materiais = elegiveis.filter((p) => (p.orcamentoPeriodo ?? 0) >= PISO_MATERIALIDADE);
    return {
      data: materiais.map((p) => ({
        id: p.id, nome: p.nome, plataforma: p.n4Curta, gestor: p.gestor ?? "—",
        // eixo X = % Comprometimento, eixo Y = % Execução (conforme especificação)
        // x/y = valores grampeados em [0,100] só para posicionar o ponto no gráfico;
        // xRaw/yRaw preservam o valor real (pode passar de 100%) para o tooltip.
        x: Math.min(Math.max((p.pctComprometimento ?? 0) * 100, 0), 100),
        y: Math.min(Math.max((p.pctExecucao ?? 0) * 100, 0), 100),
        xRaw: (p.pctComprometimento ?? 0) * 100,
        yRaw: (p.pctExecucao ?? 0) * 100,
        z: p.orcamentoPeriodo ?? 0,
        status: p.status, projeto: p,
      })),
      ocultos: elegiveis.length - materiais.length,
    };
  }, [lista]);

  return (
    <>
      <SectionHeader
        title="Matriz de Risco — Emitido × Execução"
        tooltip="Eixo X = % Emitido (valor já emitido em contrato/PO ÷ Orçamento). Eixo Y = % Execução (Realizado ÷ Orçamento). Clique num ponto para ver o detalhe."
      />
      <div className="relative">
        <ResponsiveContainer width="100%" height={400}>
          <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />

            {/* Sombreado dos quadrantes */}
            <ReferenceLine x={LIMIAR_COMPROMETIMENTO} stroke="#3DA5F4" strokeDasharray="4 4" />
            <ReferenceLine y={LIMIAR_EXECUCAO} stroke="#3DA5F4" strokeDasharray="4 4" />

            <XAxis type="number" dataKey="x" name="% Emitido" unit="%" domain={[0, 100]} stroke={colors.axis} fontSize={11} />
            <YAxis type="number" dataKey="y" name="% Execução" unit="%" domain={[0, 100]} stroke={colors.axis} fontSize={11} />
            <ZAxis type="number" dataKey="z" range={[40, 500]} name="Orçamento" />
            <Tooltip cursor={{ strokeDasharray: "3 3" }} content={<RiskMatrixTooltip />} />
            {(["Estouro", "Risco de Não Realização", "Revisão de Fluxo de Caixa", "Normal"] as const).map((s) => (
              <Scatter
                key={s}
                name={s}
                data={data.filter((d) => d.status === s)}
                fill={RISK_COLORS[s]}
                fillOpacity={0.8}
                stroke={s === "Estouro" ? "#fff" : undefined}
                strokeWidth={s === "Estouro" ? 1.5 : 0}
                onClick={(d: any) => onSelect(d.projeto)}
                cursor="pointer"
              />
            ))}
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </ScatterChart>
        </ResponsiveContainer>

        {/* Rótulos de quadrante (sobrepostos, não interativos) */}
        <div className="pointer-events-none absolute inset-0 grid grid-cols-2 grid-rows-2 text-[10px] font-semibold text-text-faint px-8 py-4">
          <span className="self-start justify-self-start">🟡 Executado acima do comprometimento esperado</span>
          <span className="self-start justify-self-end text-right">🟢 Saudável</span>
          <span className="self-end justify-self-start">🔴 Baixo comprometimento + baixa execução</span>
          <span className="self-end justify-self-end text-right">🟡 Comprometido mas pouco executado</span>
        </div>
      </div>
      {ocultos > 0 && (
        <p className="text-[11px] text-text-faint mt-1">
          {ocultos} projeto(s) com orçamento abaixo de {fmtBRL(PISO_MATERIALIDADE)} não exibido(s) aqui (percentuais pouco
          representativos com orçamento tão pequeno) — continuam contando nos KPIs e na tabela detalhada.
        </p>
      )}
    </>
  );
}

function RiskMatrixTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const comprometimentoClampado = d.xRaw > 100;
  const execucaoClampada = d.yRaw > 100;
  return (
    <div className="rounded-md border border-border bg-card-alt px-3 py-2 text-xs text-text shadow-card">
      <p className="font-bold mb-1">{d.nome}</p>
      <p className="text-text-muted">{d.plataforma} · {d.gestor}</p>
      <p>% Emitido: {fmtPct(d.xRaw / 100)}{comprometimentoClampado && " (exibido no limite de 100%)"}</p>
      <p>% Execução: {fmtPct(d.yRaw / 100)}{execucaoClampada && " (exibido no limite de 100%)"}</p>
      <p>Orçamento: {fmtBRL(d.z)}</p>
    </div>
  );
}
