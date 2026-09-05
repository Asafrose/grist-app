const { hairlineWidth } = require("nativewind/theme");

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "media",
  content: ["./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        subtle: { foreground: "hsl(var(--subtle-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        external: { DEFAULT: "hsl(var(--external))", soft: "hsl(var(--external-soft))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
      },
      fontFamily: {
        jakarta: ["PlusJakartaSans-Regular"],
        "jakarta-medium": ["PlusJakartaSans-Medium"],
        "jakarta-semibold": ["PlusJakartaSans-SemiBold"],
        "jakarta-bold": ["PlusJakartaSans-Bold"],
        "jakarta-extrabold": ["PlusJakartaSans-ExtraBold"],
        mono: ["JetBrainsMono-Regular"],
        "mono-medium": ["JetBrainsMono-Medium"],
      },
      borderRadius: {
        xl: "calc(var(--radius) + 8px)",
        lg: "calc(var(--radius) + 4px)",
        md: "var(--radius)",
        sm: "calc(var(--radius) - 4px)",
        xs: "calc(var(--radius) - 6px)",
      },
      borderWidth: { hairline: hairlineWidth() },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
