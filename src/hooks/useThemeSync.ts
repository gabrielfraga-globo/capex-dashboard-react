import { useEffect } from "react";

export function useThemeSync(theme: string): void {
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
}
