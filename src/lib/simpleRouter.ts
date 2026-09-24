import { useEffect, useState } from "react";

/**
 * Roteamento mínimo baseado em History API, sem dependências novas.
 * Suficiente para uma única rota adicional (/radar) ao lado do app existente.
 */
const NAVIGATE_EVENT = "capex:navigate";

export function navigate(path: string): void {
  if (window.location.pathname === path) return;
  window.history.pushState({}, "", path);
  window.dispatchEvent(new Event(NAVIGATE_EVENT));
}

export function useCurrentPath(): string {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const atualizar = () => setPath(window.location.pathname);
    window.addEventListener("popstate", atualizar);
    window.addEventListener(NAVIGATE_EVENT, atualizar);
    return () => {
      window.removeEventListener("popstate", atualizar);
      window.removeEventListener(NAVIGATE_EVENT, atualizar);
    };
  }, []);

  return path;
}
