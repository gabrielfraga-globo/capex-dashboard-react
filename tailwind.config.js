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
        info: { DEFAULT: "#2F6BFF", 10: "#2F6BFF1A", 30: "#2F6BFF4D" },
        ok: { DEFAULT: "#22C55E", 10: "#22C55E1A", 30: "#22C55E4D" },
        warn: { DEFAULT: "#F5A524", 10: "#F5A5241A", 30: "#F5A5244D" },
        crit: { DEFAULT: "#EF4444", 10: "#EF44441A", 30: "#EF44444D" },
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
