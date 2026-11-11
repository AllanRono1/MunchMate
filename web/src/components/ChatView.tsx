import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react"
import { MessageBubble, ThinkingBubble, type Message } from "../MessageBubble"
import { MAX_MESSAGE_LENGTH } from "../useChat"
import MunchMateLogo from "../assets/logo/munch-mate-mark-capsule-stack.svg"

/**
 * Makes Enter send the message, like most chat apps. Shift+Enter still adds a
 * new line. Used by both the landing page box and the chat box.
 */
export function submitOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
    // isComposing is true while someone types with an input method (for
    // example Chinese or Japanese), where Enter confirms a character instead.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
        // Stop Enter from adding a new line...
        event.preventDefault()
        // ...and submit the form the textarea sits in, as if Send was clicked.
        event.currentTarget.form?.requestSubmit()
    }
}

type ChatViewProps = {
    messages: Message[]
    pending: boolean
    error: string | null
    onSend: (text: string) => void
    onClose: () => void
}

/** The full-screen conversation that opens once the visitor asks a question. */
export default function ChatView({ messages, pending, error, onSend, onClose }: ChatViewProps) {
    // What the visitor is typing in the box at the bottom.
    const [draft, setDraft] = useState("")

    // Points at the newest message on the page, so we can scroll to it.
    const lastMessageRef = useRef<HTMLDivElement>(null)

    // Step 1: each time a message is added, scroll so the newest message's
    // top is in view. Scrolling to its top (rather than the bottom of the
    // page) means a long answer is read from the start, like on claude.ai.
    useEffect(() => {
        lastMessageRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    }, [messages.length])

    // Step 2: when the form is submitted (Send button or Enter), hand the
    // text to App and empty the box.
    function handleSubmit(event: FormEvent<HTMLFormElement>) {
        // Without this the browser would reload the page, its default for forms.
        event.preventDefault()
        const text = draft.trim()
        // Ignore empty messages, and wait for the current answer before
        // sending the next one.
        if (!text || pending) return
        onSend(text)
        setDraft("")
    }

    return (
        <div className="flex min-h-dvh flex-col bg-cream font-inter">
            {/* Step 3: a bar along the top that stays put while the
                conversation scrolls underneath it. */}
            <header className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-cream/90 px-4 py-3 backdrop-blur">
                <button type="button" onClick={onClose} className="flex items-center gap-2" aria-label="Back to the home page">
                    <img className="h-7" src={MunchMateLogo} alt="" />
                    <span className="font-spectral text-xl tracking-tight">Munch Mate</span>
                </button>
                <button
                    type="button"
                    onClick={onClose}
                    className="rounded-full border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-100"
                >
                    New chat
                </button>
            </header>

            {/* Step 4: the conversation itself. role="log" and aria-live let
                screen readers announce new answers as they arrive. */}
            <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6" role="log" aria-live="polite">
                {messages.map((message, index) => (
                    // Each message gets a wrapper so the newest one can hold
                    // lastMessageRef. scroll-mt-20 leaves room for the header
                    // when we scroll a message to the top.
                    <div
                        key={message.id}
                        ref={index === messages.length - 1 ? lastMessageRef : null}
                        className="flex scroll-mt-20 flex-col"
                    >
                        <MessageBubble message={message} />
                    </div>
                ))}

                {/* Shown only while we wait for the agent's answer. */}
                {pending && <ThinkingBubble />}

                {/* Shown only if the last request failed. */}
                {error && (
                    <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                        {error}
                    </p>
                )}
            </div>

            {/* Step 5: the message box, pinned to the bottom of the screen. */}
            <form onSubmit={handleSubmit} className="sticky bottom-0 bg-cream px-4 pt-2 pb-4">
                <div className="relative mx-auto max-w-3xl">
                    <textarea
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={submitOnEnter}
                        maxLength={MAX_MESSAGE_LENGTH}
                        rows={2}
                        placeholder="Ask a follow-up question"
                        aria-label="Your message"
                        className="w-full resize-none rounded-3xl border-2 border-black bg-white py-3 pr-14 pl-4 text-sm"
                    />
                    <button
                        type="submit"
                        disabled={pending || !draft.trim()}
                        aria-label="Send"
                        className="absolute right-3 bottom-4 rounded-full bg-black p-2 text-white disabled:opacity-40"
                    >
                        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 12h14M13 6l6 6-6 6" />
                        </svg>
                    </button>
                </div>
            </form>
        </div>
    )
}
