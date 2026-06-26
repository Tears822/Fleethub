import type { Config } from "tailwindcss";

/**
 * Colours / shadows / gradients aligned with
 * `UI_Refrence/vision-ui-dashboard-react/src/assets/theme/base/colors.js`
 * and sidenav / card tokens (Creative Tim Vision UI).
 */
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-plus-jakarta)", "system-ui", "sans-serif"],
      },
      colors: {
        vision: {
          bg: "#050b24",
          body: "#050510",
          panel: "#0f1535",
          sidebar: "#1a1f37",
          border: "#56577a",
          muted: "#a0aec0",
          brand: "#0075ff",
          grey700: "#2d3748",
          light: "#e9ecef",
          dark: "#344767",
        },
      },
      backgroundImage: {
        "vision-sidenav":
          "linear-gradient(127.09deg, rgba(6, 11, 40, 0.94) 19.41%, rgba(10, 14, 35, 0.49) 76.65%)",
        "vision-cover":
          "linear-gradient(168deg, #010108 0%, #070a1f 45%, #050510 100%)",
        "vision-card-dark":
          "linear-gradient(126.97deg, rgba(6, 11, 40, 0.74) 28.26%, rgba(10, 14, 35, 0.71) 91.2%)",
        "vision-mesh":
          "radial-gradient(69.43% 69.43% at 50% 0%, rgba(0, 117, 255, 0.18) 0%, transparent 55%)",
      },
      boxShadow: {
        vision: "0 8px 32px rgba(0, 0, 0, 0.35)",
        "vision-xxl": "0 20px 27px 0 rgba(0, 0, 0, 0.28)",
        "vision-md":
          "0 4px 6px -1px rgba(20, 20, 20, 0.12), 0 2px 4px -1px rgba(20, 20, 20, 0.07)",
        "vision-nav-active": "0 4px 16px rgba(0, 117, 255, 0.35)",
      },
      borderRadius: {
        vision: "15px",
        "vision-xl": "20px",
        "vision-card": "20px",
      },
    },
  },
  plugins: [],
};

export default config;
