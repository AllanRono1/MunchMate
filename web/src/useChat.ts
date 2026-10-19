import { useRef, useState } from "react"
import { askAgent } from "./api"
import type { Message } from "./MessageBubble"

// The longest message a visitor may send. The server checks the same limit.
export const MAX_MESSAGE_LENGTH = 300

/**
 * Keeps track of one conversation with the agent: the messages so far,
 * whether we are waiting for an answer, and the last error (if any).
 *
 * A "hook" is a function whose name starts with "use". It lets a component
 * keep state, and it lets us keep all the chat logic in one place instead of
 * mixing it in with the page layout in App.tsx.
 */
export function useChat() {
    // Step 1: the state React redraws the page from. Each time one of these
    // changes, every component that uses it redraws.
    const [messages, setMessages] = useState<Message[]>([])
    const [pending, setPending] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Step 2: the conversation's ID. The server remembers earlier messages per
    // ID, so we send the same one with every message in a conversation.
    // useRef (not useState) because changing it never needs to redraw anything.
    const threadIdRef = useRef(crypto.randomUUID())

    /** Throws away the current conversation and starts a fresh one. */
    function reset() {
        // A new ID means the server starts with an empty memory.
        threadIdRef.current = crypto.randomUUID()
        setMessages([])
        setPending(false)
        setError(null)
    }

    /** Sends one message and adds the agent's answer when it arrives. */
    async function send(text: string) {
        // Step 3: remember which conversation this message belongs to. If the
        // visitor starts a new chat before the answer comes back, we use this
        // to drop the late answer instead of showing it in the wrong chat.
        const threadId = threadIdRef.current

        // Step 4: show the visitor's message straight away and switch on the
        // "thinking" indicator. We pass a function (prev => ...) so we always
        // add to the latest list, even if several updates happen at once.
        setMessages((prev) => [...prev, { id: crypto.randomUUID(), who: "user", text }])
        setPending(true)
        setError(null)

        try {
            // Step 5: ask the server. This waits until the whole answer is ready.
            const reply = await askAgent(threadId, text)

            // Step 6: the visitor started a new chat while we waited, so this
            // answer no longer belongs on screen.
            if (threadIdRef.current !== threadId) return

            // Step 7: add the agent's answer under the visitor's message.
            setMessages((prev) => [...prev, { id: crypto.randomUUID(), who: "agent", text: reply }])
        } catch (err) {
            if (threadIdRef.current !== threadId) return
            // askAgent's errors are already written for the visitor to read.
            setError(err instanceof Error ? err.message : "Something went wrong.")
        } finally {
            // Step 8: whatever happened, stop the "thinking" indicator
            // (unless a new chat has already reset it).
            if (threadIdRef.current === threadId) setPending(false)
        }
    }

    return { messages, pending, error, send, reset }
}
