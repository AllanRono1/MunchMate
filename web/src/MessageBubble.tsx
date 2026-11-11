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
        // The visitor's messages: green, on the right, only as wide as the
        // text. React shows the text exactly as typed and never treats it as
        // HTML, so it is always safe.
        return (
            <div className="max-w-[80%] scroll-mt-4 self-end rounded-2xl rounded-br-sm bg-brand px-4 py-2.5 wrap-anywhere whitespace-pre-wrap text-white">
                {message.text}
            </div>
        )
    }

    return <AgentBubble text={message.text} />
}

/** The agent's replies: white, on the left, full width so longer answers and
 *  tables have room. */
function AgentBubble({ text }: { text: string }) {
    // The agent replies in Markdown: convert it to HTML, and sanitize the
    // result before it goes on the page. useMemo keeps the result, so the
    // work is not repeated every time the page redraws.
    const html = useMemo(
        () => DOMPurify.sanitize(marked.parse(text, { async: false })),
        [text],
    )

    return (
        // overflow-x-auto: a wide table scrolls sideways inside its bubble
        // instead of stretching the whole page.
        <div
            className="prose prose-sm max-w-none scroll-mt-4 overflow-x-auto rounded-2xl rounded-bl-sm border border-line bg-white px-5 py-4 text-ink shadow-sm sm:prose-base prose-headings:text-ink prose-a:text-brand prose-th:bg-brand-soft prose-th:px-3 prose-th:py-2 prose-td:px-3"
            dangerouslySetInnerHTML={{ __html: html }}
        />
    )
}

/** Shown in place of the agent's reply while we wait for it. */
export function ThinkingBubble() {
    return (
        <div className="flex items-center gap-3 self-start rounded-2xl rounded-bl-sm border border-line bg-white px-5 py-3 text-sm text-muted shadow-sm">
            <span className="flex gap-1" aria-hidden="true">
                <span className="size-2 animate-bounce rounded-full bg-brand [animation-delay:-0.3s]" />
                <span className="size-2 animate-bounce rounded-full bg-brand [animation-delay:-0.15s]" />
                <span className="size-2 animate-bounce rounded-full bg-brand" />
            </span>
            Searching and writing an answer...
        </div>
    )
}
