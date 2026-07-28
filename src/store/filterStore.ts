import { create } from "zustand";
import type { FiltrosState, Periodo, StatusRisco } from "../types";

interface FilterStore extends FiltrosState {
  setPeriodo: (p: Periodo) => void;
  setPlataforma: (v: string | null) => void;
  setGestor: (v: string | null) => void;
  setProjeto: (v: string | null) => void;
  setAprovador: (v: string | null) => void;
  setStatus: (v: StatusRisco | null) => void;
  setExecucaoRange: (min: number, max: number) => void;
  setComprometimentoRange: (min: number, max: number) => void;
  setBusca: (v: string) => void;
  limparFiltros: () => void;
}

const DEFAULTS: FiltrosState = {
  periodo: "2026",
  plataforma: null,
  gestor: null,
  projeto: null,
  aprovador: null,
  status: null,
  execucaoMin: 0,
  execucaoMax: 100,
  comprometimentoMin: 0,
  comprometimentoMax: 100,
  busca: "",
};

export const useFilterStore = create<FilterStore>((set) => ({
  ...DEFAULTS,
  setPeriodo: (periodo) => set({ periodo }),
  setPlataforma: (plataforma) => set({ plataforma }),
  setGestor: (gestor) => set({ gestor }),
  setProjeto: (projeto) => set({ projeto }),
  setAprovador: (aprovador) => set({ aprovador }),
  setStatus: (status) => set({ status }),
  setExecucaoRange: (execucaoMin, execucaoMax) => set({ execucaoMin, execucaoMax }),
  setComprometimentoRange: (comprometimentoMin, comprometimentoMax) => set({ comprometimentoMin, comprometimentoMax }),
  setBusca: (busca) => set({ busca }),
  limparFiltros: () =>
    set((state) => ({ ...DEFAULTS, periodo: state.periodo })), // mantém o período, limpa o resto
}));
