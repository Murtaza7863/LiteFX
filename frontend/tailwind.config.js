/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        rail: {
          local: "#10b981",
          linked: "#3b82f6",
          "claim_link": "#f59e0b",
          "stable_bridge": "#a855f7",
        },
      },
    },
  },
  plugins: [],
};
