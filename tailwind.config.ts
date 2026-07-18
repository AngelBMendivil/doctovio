import type { Config } from "tailwindcss";

/**
 * Tema Doctovio. Los valores viven en src/app/globals.css como variables CSS;
 * aquí solo se exponen como utilidades de Tailwind. Ningún componente debe
 * escribir hex directo: si un color no existe como token, se agrega aquí.
 */
const config: Config = {
  darkMode: "class",
  content: ["./src/app/**/*.{ts,tsx}", "./src/components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
          soft: "hsl(var(--accent-soft))",
        },
        navy: {
          DEFAULT: "hsl(var(--navy))",
          foreground: "hsl(var(--navy-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        warning: "hsl(var(--warning))",
        success: "hsl(var(--success))",
      },
      fontFamily: {
        sans: ["'Plus Jakarta Sans'", "system-ui", "-apple-system", "sans-serif"],
      },
      borderRadius: {
        sm: "0.375rem",
        md: "0.5rem",
        lg: "0.75rem",
        xl: "0.875rem", // 14px: radio de tarjeta de la marca
        "2xl": "1rem",
      },
      boxShadow: {
        // Sombras muy suaves: el producto se apoya en el borde, no en la sombra.
        card: "0 1px 2px rgba(13, 43, 69, 0.04), 0 1px 3px rgba(13, 43, 69, 0.06)",
        "card-hover": "0 2px 4px rgba(13, 43, 69, 0.06), 0 8px 16px rgba(13, 43, 69, 0.08)",
        popover: "0 4px 6px rgba(13, 43, 69, 0.05), 0 12px 32px rgba(13, 43, 69, 0.12)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(-4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.15s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
