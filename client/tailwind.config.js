/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: { extend: { colors: { ink: "#172033", brand: "#6558e8", mint: "#dcfce7" }, boxShadow: { soft: "0 16px 50px rgba(27, 39, 80, .08)" } } },
  plugins: []
};
