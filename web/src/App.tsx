import { useEffect, useState, type FormEvent } from "react"
import { MAX_MESSAGE_LENGTH, useChat } from "./useChat"
import ChatView, { submitOnEnter } from "./components/ChatView"
import Stats from "./components/Stats"
import data from "./data"
import scrollData from "./scrollDetails"
import ProsSlide from "./components/ProsSlide"
import videoMP4Desktop from './assets/videos/wind_blowing_on_woman_desktop.mp4'
import videoMP4Mobile from './assets/videos/wind_blowing_on_woman_mobile.mp4'
import videoWEBMDesktop from './assets/videos/wind_blowing_on_womanWEBM_desktop.webm'
import videoWEBMobile from './assets/videos/wind_blowing_on_womanWEBM_mobile.webm'
import FAOLogo from "./assets/icons/FAO_logo.webp"
import MohLogo from "./assets/icons/MoHKenyaLogo.webp"
import WHOlogo from "./assets/icons/who-emblem.webp"
import MunchMateLogo from "./assets/logo/munch-mate-mark-capsule-stack.svg"




// Shown before the first message, to give the visitor somewhere to start.
const EXAMPLE_QUESTIONS = [
    "Can a patient on warfarin eat sukuma wiki every day?",
    "Which foods should a patient on chemotherapy avoid?",
    "Does grapefruit interact with tacrolimus?",
]

export default function App() {
    // The conversation (messages, loading, errors), kept by useChat.
    const chat = useChat()

    // Which screen to show. false = the landing page, true = the chat.
    const [chatOpen, setChatOpen] = useState(false)

    // What the visitor is typing in the landing page box.
    const [draft, setDraft] = useState("")

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
        setChatOpen(true) // swap the landing page for the chat screen
        window.history.pushState({ chat: true }, "") // so Back returns here
        window.scrollTo(0, 0)
        chat.send(question)
    }

    // Leave the chat ("New chat" or the logo). Going back fires popstate.
    function closeChat() {
        window.history.back()
    }

    // The landing page form was submitted (arrow button or Enter).
    function handleLandingSubmit(event: FormEvent<HTMLFormElement>) {
        // Without this the browser would reload the page.
        event.preventDefault()
        const question = draft.trim()
        if (!question) return
        setDraft("")
        openChat(question)
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

    const patientData = data.map(patient => {
        return <Stats key={patient.id} record={patient.record} unit={patient.unit} title={patient.title} description={patient.description}/>
    })
    const webPros = scrollData.map(item => {
        return <ProsSlide key={item.id} src={item.img.src} alt={item.img.alt} heading={item.heading} details={item.details} link={item.link}/>
    })
    return(
        <main>
            <section className="max-w-[95vw] mx-auto min-h-[95vh] text-center mt-3 bg-cream flex flex-col justify-end relative font-inter">
                <div className="w-[95vw] h-[95vh] overflow-hidden rounded-2xl">
                    <video loop autoPlay muted playsInline>
                        <source src={videoMP4Mobile} type="video/mp4" media="(max-width: 768px)"></source>
                        <source src={videoWEBMobile} type="video/webm" media="(max-width: 768px)"></source>
                        <source src={videoMP4Desktop} type="video/mp4" media="(min-width: 768px)"></source>
                        <source src={videoWEBMDesktop} type="video/webm" media="(min-width: 768px)"></source>
                        <p>
                            Your browser doesn't support this video. Here is a
                            <a href={videoMP4Desktop}>link to the video</a> instead.
                        </p>
                    </video>
                </div>
                <div className="absolute bottom-3 max-w-[98.5%] mx-auto">
                    <h1 className=" text-white text-2xl/7 tracking-tight font-medium">A new level of confidence when eating with your medication</h1>
                    <p className="text-cream text-sm/4 py-4">Whatever you're eating with your medication, start here.</p>
                    <form className="relative" onSubmit={handleLandingSubmit}>
                        <label>
                            <span className="sr-only">Your question</span>
                            <textarea
                                className="pt-3 py-14 px-4 bg-white border-2 border-solid border-black rounded-3xl text-sm w-[98.5%]"
                                placeholder={EXAMPLE_QUESTIONS[2]}
                                value={draft}
                                onChange={(event) => setDraft(event.target.value)}
                                onKeyDown={submitOnEnter}
                                maxLength={MAX_MESSAGE_LENGTH}
                            ></textarea>
                        </label>
                        <button type="submit" disabled={!draft.trim()} className="disabled:opacity-60 arrow-btn p-2 text-white absolute right-4 bottom-2 bg-black border border-solid border-blue rounded-4xl" aria-label="Send">
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
                </div>
            </section>
            <section className="max-w-[80vw] mx-auto text-3xl/8 tracking-tighter py-12">
                <p className="font-spectral">
                    MunchMate uses AI to search the web for each question, including Kenyan Ministry of Health and FAO guidance
                    {" "}
                    <span className="inline-flex align-middle relative">
                        <img className="h-8 w-8 object-contain" srcSet={WHOlogo} alt="world health organisation logo"/>
                        <img className="h-8 w-8 object-contain rounded-4xl relative right-2" srcSet={FAOLogo} alt="food and agriculture organisation logo"/>
                        <img className="h-8 w-8 object-contain rounded-4xl border border-solid border-gray-200 relative right-4 bg-white" srcSet={MohLogo} alt="ministry of health logo"/>
                    </span>, and gives you a short answer with links to every source it used.
                    It’s free to use, never includes ads, and needs no account.
                </p>
            </section>
            <section className="pb-12">
                {patientData}
            </section>
            <section className="ml-3.5 mr-3.5 pb-10">
                <h2 className="text-3xl/7 tracking-tight pb-5 font-semibold">Why it works<br></br><span className="text-blue-500">for you</span></h2>
                <div className="font-inter pb-12 flex flex-nowrap overflow-x-auto gap-4 snap-x snap-mandatory overscroll-x-contain">
                    {webPros}
                </div>
            </section>
            <section className="max-w-[98vw] mx-auto text-center p-10">
                <h2 className="font-spectral text-6xl/12 -tracking-widest pb-5">More coming soon</h2>
                <p className="font-inter text-gray-400">Going beyond answers, you'll be able to save your medication list, build Kenyan meal plans around it, and keep every answer in one place.</p>
            </section>
            <footer className="mb-10">
                <nav>
                    <ul className="text-center font-spectral text-4xl/10 -tracking-widest p-12">
                        <li><a href="">How it works</a></li>
                        <li><a href="">Coming soon</a></li>
                        <li><a href="">Frequently asked questions</a></li>
                        <li><a href="">Feedback</a></li>
                    </ul>
                </nav>
                <div className="text-center relative">
                    <h2 className="font-spectral text-6xl/12 -tracking-widest pb-5">Munch Mate</h2>
                    <img className="h-8 absolute left-1/2 -translate-x-1/2" src={MunchMateLogo} alt="Munch Mate Logo"/>
                </div>
            </footer>
        </main>
    )
}
