import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

// Tema Tamarcado (tokens da Sally, DL-037). Dark via [data-theme="dark"]
// (mecanismo da Story 1.7 / users.theme) — não a classe .dark do shadcn.
// Cores em `hsl(var(--x) / <alpha-value>)` para os modificadores de opacidade
// (hover do shadcn, tints de status) funcionarem com variáveis CSS.
const hslVar = (name: string) => `hsl(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: hslVar("border"),
        input: hslVar("input"),
        ring: hslVar("ring"),
        background: hslVar("background"),
        foreground: hslVar("foreground"),
        primary: {
          DEFAULT: hslVar("primary"),
          foreground: hslVar("primary-foreground"),
        },
        secondary: {
          DEFAULT: hslVar("secondary"),
          foreground: hslVar("secondary-foreground"),
        },
        muted: {
          DEFAULT: hslVar("muted"),
          foreground: hslVar("muted-foreground"),
        },
        accent: {
          DEFAULT: hslVar("accent"),
          foreground: hslVar("accent-foreground"),
        },
        destructive: {
          DEFAULT: hslVar("destructive"),
          foreground: hslVar("destructive-foreground"),
        },
        card: {
          DEFAULT: hslVar("card"),
          foreground: hslVar("card-foreground"),
        },
        popover: {
          DEFAULT: hslVar("popover"),
          foreground: hslVar("popover-foreground"),
        },
        // Status do design system (Sally §2.2)
        status: {
          pending: hslVar("status-pending"),
          confirmed: hslVar("status-confirmed"),
          done: hslVar("status-done"),
          cancelled: hslVar("status-cancelled"),
          noshow: hslVar("status-noshow"),
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["system-ui", "sans-serif"],
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
