import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

// Vite is the tool that turns the React code in web/ into plain HTML, CSS and
// JavaScript files a browser can load.
export default defineConfig({
    // The website's code lives in web/. The built files go to web/dist.
    root: "web",

    plugins: [react(), tailwindcss()],

    // While developing, Vite serves the website on its own port (5173) and
    // the Express server runs on 3000. This passes any request starting with
    // /api on to Express, so the website can call /api/chat as if both were
    // the same server.
    server: {
        proxy: {
            "/api": "http://localhost:3000",
        },
    },
})
