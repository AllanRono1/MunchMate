import { useEffect, useRef, useState, type FormEvent } from "react"
import { useChat } from "./useChat"
import ChatView from "./components/ChatView"
import NavBar from "./components/NavBar"
import Footer from "./components/Footer"
import QuestionForm from "./components/QuestionForm"
import HomePage from "./pages/HomePage"
import HowItWorksPage from "./pages/HowItWorksPage"
import FaqPage from "./pages/FaqPage"
import { Link, usePath } from "./router"

// The browser tab's title for each page.
const TITLES: Record<string, string> = {
    "/": "MunchMate: food and medication answers",
    "/how-it-works": "How it works · MunchMate",
    "/faq": "FAQ · MunchMate",
}

export default function App() {
    // Which page the address bar points at, for example "/faq".
    const path = usePath()

    // The conversation (messages, loading, errors), kept by useChat.
    const chat = useChat()

    // Which screen to show. false = the site's pages, true = the chat.
    const [chatOpen, setChatOpen] = useState(false)

    // What the visitor is typing. Shared by every question box, so text
    // carries over between them.
    const [draft, setDraft] = useState("")

    // The hero box on the home page, and the box fixed to the bottom.
    const heroFormRef = useRef<HTMLDivElement>(null)
    const heroTextareaRef = useRef<HTMLTextAreaElement>(null)
    const bottomTextareaRef = useRef<HTMLTextAreaElement>(null)

    // On the home page, show the bottom box once the hero's box has scrolled
    // up and out of view. An IntersectionObserver tells us whenever the hero
    // box enters or leaves the screen, without checking on every scroll.
    const [pastHero, setPastHero] = useState(false)
    useEffect(() => {
        const heroForm = heroFormRef.current
        // The hero is only on the home page, and not while the chat is open.
        if (!heroForm) return
        const observer = new IntersectionObserver(([entry]) => {
            if (!entry) return
            // Off screen *above* the viewport means the visitor scrolled past
            // it. (Off screen below would mean it has not been reached yet.)
            setPastHero(!entry.isIntersecting && entry.boundingClientRect.top < 0)
        })
        observer.observe(heroForm)
        return () => observer.disconnect()
    }, [chatOpen, path])

    // Other pages have no hero box, so the bottom box is always there.
    const showBottomForm = path === "/" ? pastHero : true

    // Name the browser tab after the page.
    useEffect(() => {
        document.title = TITLES[path] ?? "Page not found · MunchMate"
    }, [path])

    // Make the browser's Back button leave the chat: opening the chat adds a
    // history entry, and pressing Back fires "popstate", which closes it.
    useEffect(() => {
        const handleBack = () => setChatOpen(false)
        window.addEventListener("popstate", handleBack)
        return () => window.removeEventListener("popstate", handleBack)
    }, [])

    // Open the chat screen and send the visitor's first question.
    function openChat(question: string) {
        chat.reset() // start a brand new conversation
        setChatOpen(true) // swap the page for the chat screen
        window.history.pushState({ chat: true }, "") // so Back returns here
        window.scrollTo(0, 0)
        chat.send(question)
    }

    // Leave the chat ("New chat" or the logo). Going back fires popstate.
    function closeChat() {
        window.history.back()
    }

    // A question box was submitted (arrow button or Enter).
    function handleSubmit(event: FormEvent<HTMLFormElement>) {
        // Without this the browser would reload the page.
        event.preventDefault()
        const question = draft.trim()
        if (!question) return
        setDraft("")
        openChat(question)
    }

    // The "Ask a question" buttons: put the cursor in a question box. On the
    // home page that is the hero box (scrolling back up to it); elsewhere it
    // is the box at the bottom.
    function focusQuestionBox() {
        if (path === "/" && heroTextareaRef.current) {
            window.scrollTo({ top: 0, behavior: "smooth" })
            heroTextareaRef.current.focus({ preventScroll: true })
        } else {
            bottomTextareaRef.current?.focus()
        }
    }

    // While the chat is open, show only the chat screen.
    if (chatOpen) {
        return (
            <ChatView
                messages={chat.messages}
                pending={chat.pending}
                error={chat.error}
                onSend={chat.send}
                onClose={closeChat}
            />
        )
    }

    let page
    if (path === "/") {
        page = <HomePage draft={draft} setDraft={setDraft} onSubmit={handleSubmit} heroFormRef={heroFormRef} heroTextareaRef={heroTextareaRef} />
    } else if (path === "/how-it-works") {
        page = <HowItWorksPage onAsk={focusQuestionBox} />
    } else if (path === "/faq") {
        page = <FaqPage onAsk={focusQuestionBox} />
    } else {
        page = <NotFoundPage />
    }

    return (
        <>
            <NavBar path={path} onAsk={focusQuestionBox} />
            {/* The nav bar floats over the page. The home page's hero is meant
                to sit under it; the other pages start 5rem lower (its height
                plus its top-3 offset) so their headings are not covered. */}
            {path === "/" ? page : <div className="pt-20">{page}</div>}
            <Footer />

            {/* A question box fixed to the bottom of the screen. It shares
                `draft` with the hero box, so anything typed carries over. When
                hidden, `inert` stops it taking keyboard focus or being read by
                screen readers. */}
            <div
                inert={!showBottomForm}
                className={`fixed inset-x-0 bottom-0 z-20 bg-linear-to-t from-white via-white/90 to-transparent px-3 pt-8 pb-3 font-inter transition duration-300 motion-reduce:transition-none md:pb-5 ${showBottomForm ? "translate-y-0 opacity-100" : "translate-y-full opacity-0"}`}
            >
                <div className="mx-auto max-w-[98.5%] md:max-w-2xl lg:max-w-3xl">
                    <QuestionForm draft={draft} setDraft={setDraft} onSubmit={handleSubmit} textareaRef={bottomTextareaRef} compact />
                </div>
            </div>
        </>
    )
}

/** Shown for any address that is not one of the site's pages. */
function NotFoundPage() {
    return (
        <main className="mx-auto max-w-3xl px-4 py-24 text-center font-inter">
            <h1 className="font-spectral text-5xl/14 tracking-tighter">Page not found</h1>
            <p className="pt-4 text-gray-500">That page does not exist.</p>
            <Link to="/" className="mt-8 inline-block rounded-full bg-black px-5 py-3 text-sm font-medium text-white hover:bg-gray-500">
                Go to the home page
            </Link>
        </main>
    )
}
