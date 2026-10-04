import express from "express"
import { rateLimit } from "express-rate-limit"
import { sendMessage } from "./agent"

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

// The longest message a visitor may send.
const MAX_MESSAGE_LENGTH = 300

// What a valid conversation ID looks like: 8 to 64 letters, digits, dashes
// or underscores. The browser sends a random UUID, which fits this pattern.
// Checking the shape stops anyone sending something huge or strange as an ID.
const THREAD_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/

/**
 * Middleware that checks a chat request before anything expensive happens.
 * If the request is bad it replies with an error and stops there. If it is
 * fine it calls next(), which hands the request on to the next step in the
 * chain (the rate limiter, then the route handler).
 */
function validateChatRequest(req: express.Request, res: express.Response, next: express.NextFunction) {
    const { threadId, message } = req.body ?? {}

    if (typeof threadId !== "string" || !THREAD_ID_PATTERN.test(threadId)) {
        res.status(400).json({ error: "Invalid conversation. Please reload the page." })
        return
    }
    if (typeof message !== "string" || !message.trim()) {
        res.status(400).json({ error: "Please type a message." })
        return
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
        res.status(400).json({ error: `Please keep your message under ${MAX_MESSAGE_LENGTH} characters.` })
        return
    }

    next()
}

// Every message costs one web search and one model call, so cap how many a
// single visitor can send: 30 messages every 10 minutes.
const messageLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 30,
    message: { error: "Too many messages. Please try again in a few minutes." },
})

// A route: when the browser sends a POST request to /api/chat, run these
// steps in order. Each of the first two can stop the request early; only
// if both pass does the last function run.
// req is what the browser sent, res is what we send back.
server.post("/api/chat", validateChatRequest, messageLimiter, async (req, res) => {
    const { threadId, message } = req.body

    try {
        // reply is the agent's answer, written in Markdown.
        const reply = await sendMessage(threadId, message.trim())
        res.json({ reply })
    } catch (error) {
        // Log the real error for us, but send the visitor a plain message
        console.error("Agent failed:", error)
        res.status(500).json({ error: "The agent could not answer right now. Please try again." })
    }
})

// Render tells us which port to listen on through process.env.PORT.
// On our own machine that is not set, so we fall back to 3000.
const port = process.env.PORT || 3000

server.listen(port, (error) => {
    // Express hands any start-up failure to this callback instead of
    // crashing. The usual cause is that another program (often an older copy
    // of this server) is already using the port.
    if (error) {
        console.error(`Could not start the server on port ${port}:`, error.message)
        process.exit(1)
    }
    console.log(`Server running at http://localhost:${port}`)
})
