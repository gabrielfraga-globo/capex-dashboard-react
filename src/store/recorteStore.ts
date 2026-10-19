import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import type { Recorte } from "../lib/recorte";

interface RecorteStore extends Recorte {
  setPrograma: (v: string | null) => void;
  setRubricas: (v: string[]) => void;
  setPlataforma: (v: string | null) => void;
  setGestor: (v: string | null) => void;
  setAprovador: (v: string | null) => void;
  setBusca: (v: string) => void;
  limpar: () => void;
}

const DEFAULTS: Recorte = {
  programa: null,
  rubricas: [],
  plataforma: null,
  gestor: null,
  aprovador: null,
  busca: "",
};

// Armazenamento pode estar indisponível (modo privado, bloqueio de cookies) ou conter JSON inválido.
const sessionStorageSeguro: StateStorage = {
  getItem: (name) => {
    try {
      const valor = sessionStorage.getItem(name);
      if (valor) JSON.parse(valor);
      return valor;
    } catch {
      return null;
    }
  },
  setItem: (name, valor) => {
    try {
      sessionStorage.setItem(name, valor);
    } catch {
      // sem persistência: o recorte vale só até recarregar a página
    }
  },
  removeItem: (name) => {
    try {
      sessionStorage.removeItem(name);
    } catch {
      // idem setItem
    }
  },
};

export const useRecorteStore = create<RecorteStore>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      setPrograma: (programa) => set({ programa }),
      setRubricas: (rubricas) => set({ rubricas }),
      setPlataforma: (plataforma) => set({ plataforma }),
      setGestor: (gestor) => set({ gestor }),
      setAprovador: (aprovador) => set({ aprovador }),
      setBusca: (busca) => set({ busca }),
      limpar: () => set({ ...DEFAULTS }),
    }),
    {
      name: "capex-recorte",
      storage: createJSONStorage(() => sessionStorageSeguro),
    },
  ),
);
