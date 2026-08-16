/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Outfit", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
        display: ["Fraunces", "ui-serif", "Georgia", "serif"],
      },
      colors: {
        rail: {
          local: "#9aaa8c",
          linked: "#8a9aab",
          claim_link: "#c4a574",
          stable_bridge: "#a898a4",
        },
      },
      keyframes: {
        fadeInUp: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.98)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "fade-in-up": "fadeInUp 0.35s ease-out both",
        "fade-in": "fadeIn 0.3s ease-out both",
        "scale-in": "scaleIn 0.2s ease-out both",
      },
    },
  },
  plugins: [],
};
