export default {
    content: ["./index.html", "./src/**/*.{ts,tsx}"],
    theme: {
        extend: {
            fontFamily: {
                sans: ["Thmanyah Sans", "Tajawal", "Cairo", "system-ui", "sans-serif"],
            },
            colors: {
                brand: {
                    50: "#eefdf8",
                    100: "#d5f8ed",
                    500: "#1b9a7b",
                    600: "#137f67",
                    700: "#116653",
                },
            },
            boxShadow: {
                panel: "0 18px 50px rgba(15, 23, 42, 0.08)",
            },
        },
    },
    plugins: [],
};
