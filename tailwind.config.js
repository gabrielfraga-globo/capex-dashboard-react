/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['selector', '[data-theme="dark"]'],
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: { DEFAULT: "var(--color-bg)", sidebar: "var(--color-bg-sidebar)" },
        card: { DEFAULT: "var(--color-card)", alt: "var(--color-card-alt)" },
        border: { DEFAULT: "var(--color-border)", subtle: "var(--color-border-subtle)" },
        text: { DEFAULT: "var(--color-text)", muted: "var(--color-text-muted)", faint: "var(--color-text-faint)" },
        accent: { DEFAULT: "rgb(var(--color-accent) / <alpha-value>)" },
        gradA: "var(--gradient-a)",
        gradB: "var(--gradient-b)",
        risk: { critico: "#C0392B", alto: "#E0672E", medio: "#E0B429", baixo: "#2A9D6F", revisao: "#5B7FDE" },
        info: { DEFAULT: "#7C8CF8", 10: "#7C8CF81A", 30: "#7C8CF84D" },
        ok: { DEFAULT: "#2A9D6F", 10: "#2A9D6F1A", 30: "#2A9D6F4D" },
        warn: { DEFAULT: "#E0A43A", 10: "#E0A43A1A", 30: "#E0A43A4D" },
        crit: { DEFAULT: "#E5484D", 10: "#E5484D1A", 30: "#E5484D4D" },
      },
      borderRadius: { card: "18px" },
      fontFamily: { sans: ["Segoe UI", "Inter", "system-ui", "sans-serif"] },
      boxShadow: { card: "var(--card-shadow)" },
      backgroundImage: {
        hero: "linear-gradient(135deg, var(--gradient-a), var(--gradient-b))",
      },
    },
  },
  plugins: [],
};
