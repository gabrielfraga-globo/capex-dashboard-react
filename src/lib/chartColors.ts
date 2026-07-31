import type { Theme } from "../store/themeStore";

export function getChartColors(theme: Theme) {
  if (theme === "light") {
    return {
      grid: "#E4E2F0",
      axis: "#6B7280",
      tooltipBg: "#FFFFFF",
      tooltipBorder: "#E4E2F0",
      tooltipText: "#1A1A2E",
      tooltipLabel: "#6B7280",
    };
  }
  return {
    grid: "#22304A",
    axis: "#8CA0BF",
    tooltipBg: "#16202F",
    tooltipBorder: "#22304A",
    tooltipText: "#E6EAF2",
    tooltipLabel: "#8CA0BF",
  };
}

export function chartTooltipStyle(theme: Theme) {
  const c = getChartColors(theme);
  return {
    contentStyle: { background: c.tooltipBg, border: `1px solid ${c.tooltipBorder}`, borderRadius: 8, fontSize: 12, color: c.tooltipText },
    labelStyle: { color: c.tooltipLabel },
  };
}
