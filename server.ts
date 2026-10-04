import express from "express"
import { rateLimit } from "express-rate-limit"
import { generateReport } from "./agent"

// express() creates the web server. Everything below teaches it what to do
// when a request arrives.
const server = express()

// Render sits in front of our server as a proxy. This tells Express to trust
// it, so the rate limiter sees each visitor's real IP instead of Render's.
server.set("trust proxy", 1)

// Middleware = code that runs on every request before our own handlers.
// This one reads a JSON request body and puts it on req.body.
server.use(express.json())

// This one serves the files in the public/ folder, so visiting the site's
// address returns public/index.html.
server.use(express.static("public"))

// Every question costs 9 searches and one model call, so cap how many a
// single visitor can ask: 5 questions every 10 minutes.
const askLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 5,
    message: { error: "Too many questions. Please try again in a few minutes." },
})

// A route: when the browser sends a POST request to /api/ask, run this
// function. req is what the browser sent, res is what we send back.
server.post("/api/ask", askLimiter, async (req, res) => {
    const question = req.body?.question

    if (typeof question !== "string" || !question.trim()) {
        res.status(400).json({ error: "Please type a question." })
        return
    }
    if (question.length > 300) {
        res.status(400).json({ error: "Please keep the question under 300 characters." })
        return
    }

    try {
        const report = await generateReport(question.trim())
        res.json({ report })
    } catch (error) {
        // Log the real error for us, but send the visitor a plain message
        console.error("Agent failed:", error)
        res.status(500).json({ error: "The agent could not answer right now. Please try again." })
    }
})

// Render tells us which port to listen on through process.env.PORT.
// On our own machine that is not set, so we fall back to 3000.
const port = process.env.PORT || 3000

server.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`)
})
