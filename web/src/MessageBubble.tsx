import { useMemo } from "react"
import DOMPurify from "dompurify"
import { marked } from "marked"

export type Message = {
    // A unique ID, so React can tell the bubbles apart.
    id: string
    who: "user" | "agent"
    text: string
}

/** One message in the conversation. */
export function MessageBubble({ message }: { message: Message }) {
    if (message.who === "user") {
        // The visitor's messages: a bordered bubble on the right, only as
        // wide as the text. Only the visitor's messages have a border, so it
        // is easy to see where each question starts. React shows the text
        // exactly as typed and never treats it as HTML, so it is always safe.
        return (
            <div className="max-w-[80%] self-end rounded-2xl rounded-br-sm border border-gray-200 bg-white px-4 py-2.5 wrap-anywhere whitespace-pre-wrap text-black">
                {message.text}
            </div>
        )
    }

    return <AgentBubble text={message.text} />
}

/** The agent's replies: plain text on the page with no border or background
 *  (like claude.ai), full width so longer answers and tables have room. */
function AgentBubble({ text }: { text: string }) {
    // The agent replies in Markdown: convert it to HTML, and sanitize the
    // result before it goes on the page. useMemo keeps the result, so the
    // work is not repeated every time the page redraws.
    const html = useMemo(
        () => DOMPurify.sanitize(marked.parse(text, { async: false })),
        [text],
    )

    return (
        // overflow-x-auto: a wide table scrolls sideways inside the answer
        // instead of stretching the whole page.
        <div
            className="prose prose-sm max-w-none overflow-x-auto text-ink sm:prose-base prose-headings:text-ink prose-a:text-blue-500 prose-th:bg-blue-50 prose-th:px-3 prose-th:py-2 prose-td:px-3"
            dangerouslySetInnerHTML={{ __html: html }}
        />
    )
}

/** Shown in place of the agent's reply while we wait for it. */
export function ThinkingBubble() {
    return (
        // No border here either, so it sits where the answer will appear.
        <div className="flex items-center gap-3 self-start text-sm text-muted">
            <span className="flex gap-1" aria-hidden="true">
                <span className="size-2 animate-bounce rounded-full bg-blue-500 [animation-delay:-0.3s]" />
                <span className="size-2 animate-bounce rounded-full bg-blue-500 [animation-delay:-0.15s]" />
                <span className="size-2 animate-bounce rounded-full bg-blue-500" />
            </span>
            Searching and writing an answer...
        </div>
    )
}
