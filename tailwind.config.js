/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: { DEFAULT: "#0E1520", sidebar: "#0A1019" },
        card: { DEFAULT: "#121A26", alt: "#16202F" },
        border: { DEFAULT: "#22304A", subtle: "#1B2534" },
        text: { DEFAULT: "#E6EAF2", muted: "#8CA0BF", faint: "#6B85AD" },
        accent: { DEFAULT: "#3DA5F4" },
        risk: { critico: "#C0392B", alto: "#E0672E", medio: "#E0B429", baixo: "#2A9D6F" },
      },
      borderRadius: { card: "14px" },
      fontFamily: { sans: ["Segoe UI", "Inter", "system-ui", "sans-serif"] },
      boxShadow: { card: "0 2px 10px rgba(0,0,0,.25)" },
    },
  },
  plugins: [],
};
