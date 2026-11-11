import type { FormEvent, Ref } from "react"
import { MAX_MESSAGE_LENGTH } from "../useChat"
import { submitOnEnter } from "./ChatView"

// An example question, shown in the hero box to give visitors a start.
const EXAMPLE_QUESTION = "Does grapefruit interact with tacrolimus?"

type QuestionFormProps = {
    draft: string
    setDraft: (text: string) => void
    onSubmit: (event: FormEvent<HTMLFormElement>) => void
    // A shorter box with no example, for the bar fixed to the bottom of the screen.
    compact?: boolean
    // Lets the page move the cursor into this box (the "Ask a question" button).
    textareaRef?: Ref<HTMLTextAreaElement>
}

/** The question box with its Send button. Used in the hero and in the bar
 *  fixed to the bottom of the screen. */
export default function QuestionForm({ draft, setDraft, onSubmit, compact = false, textareaRef }: QuestionFormProps) {
    return (
        <form className="relative" onSubmit={onSubmit}>
            <label>
                <span className="sr-only">Your question</span>
                <textarea
                    ref={textareaRef}
                    className={`bg-white border-2 border-solid border-black rounded-3xl text-sm w-[98.5%] ${compact ? "block mx-auto resize-none py-3.5 pl-4 pr-14" : "pt-3 py-14 px-4"}`}
                    rows={compact ? 1 : undefined}
                    placeholder={compact ? undefined : EXAMPLE_QUESTION}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={submitOnEnter}
                    maxLength={MAX_MESSAGE_LENGTH}
                ></textarea>
            </label>
            <button
                type="submit"
                disabled={!draft.trim()}
                className={`disabled:opacity-60 p-2 text-white absolute bg-black border rounded-4xl ${compact ? "right-4 top-1/2 -translate-y-1/2" : "right-4 bottom-2"}`}
                aria-label="Send"
            >
                <svg
                    viewBox="0 0 24 24"
                    width="20"
                    height="20"
                    aria-hidden="true"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
            </button>
        </form>
    )
}
