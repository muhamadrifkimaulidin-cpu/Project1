import type { Config } from "tailwindcss";

// Tampilan utama memakai kelas di app/globals.css (design system WWTP).
// Tailwind tetap tersedia untuk utilitas kecil.
export default {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
