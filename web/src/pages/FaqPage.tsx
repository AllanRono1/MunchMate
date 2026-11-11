import { Link } from "../router"
import { PageHeading } from "./HowItWorksPage"

// Each answer describes how the site really works (agent.ts and server.ts);
// keep them in step if that changes.
const FAQS = [
    {
        q: "What is MunchMate?",
        a: "A free AI assistant that answers questions about food and medication. It searches the web, including Kenyan government and research sites, and gives you a short answer with links to the sources it used.",
    },
    {
        q: "Is it free? Do I need an account?",
        a: "It is free, has no ads, and needs no account. Open the site and ask.",
    },
    {
        q: "Can MunchMate replace my doctor, pharmacist or dietitian?",
        a: "No. It gives general information and does not know your medical history. Use it to understand your options and prepare questions, then confirm with your doctor, pharmacist or dietitian before changing a diet or a medicine. If someone has a severe reaction, go to the nearest health facility straight away.",
    },
    {
        q: "What can I ask about?",
        a: "Nutrition, food, diet, and how medicines interact with food. For example: “Which foods should a patient on chemotherapy avoid?” or “Is ugali a good choice with diabetes?” It will not answer questions on other topics.",
    },
    {
        q: "Where do the answers come from?",
        a: "For each question MunchMate runs up to three web searches and reads the top results, up to nine pages in total. One search looks only at Kenyan sources: the Ministry of Health, the Division of Family Health, the Ministry of Agriculture, KEMRI and the FAO. The answer is written from those results, and every source is linked at the end.",
    },
    {
        q: "What does “What I could not confirm” mean?",
        a: "It appears when the sources did not cover exactly what you asked, for example they talk about leafy greens in general rather than managu, or about a type of medicine rather than the one you named. It tells you what is missing so you know what to check with a professional. If nothing reliable was found at all, MunchMate says so instead of guessing.",
    },
    {
        q: "Why does it sometimes ask me a question back?",
        a: "Some answers depend on details like kidney or liver function, age, allergies or other medicines. MunchMate gives the general answer and then asks for the one detail that matters most.",
    },
    {
        q: "Does it remember our conversation?",
        a: "Within a chat, yes: it remembers your last five questions and answers, so you can ask follow-ups. Chats are not saved. A chat is forgotten when you start a new one or reload the page, after an hour without use, or when the server restarts.",
    },
    {
        q: "Is what I type private?",
        a: "To answer, your question is sent to an AI model (NVIDIA's Nemotron, through OpenRouter) and to a web search service (Tavily). MunchMate does not ask who you are and keeps the chat in the server's memory only while it is in use, though the searches made from your question may appear in the server's logs. Please do not include names, ID numbers or other personal details in your questions.",
    },
    {
        q: "Is there a limit on questions?",
        a: "Each message can be up to 300 characters, and you can send up to 30 messages every 10 minutes. The limits keep the service free and fair for everyone.",
    },
    {
        q: "Why is an answer slow, or why did I get an error?",
        a: "Each answer needs several web searches and an AI model, so it can take a little while. MunchMate uses a free AI model that is sometimes busy, and the server sleeps when nobody has used it for a while, so the first question can be slower. If you see an error, wait a minute and try again.",
    },
    {
        q: "Will it save my medication list or plan my meals?",
        a: "Not yet. You can already ask for affordable Kenyan meal ideas that suit a medicine or condition. Saving your medication list, building meal plans around it and keeping every answer in one place are planned.",
    },
]

export default function FaqPage({ onAsk }: { onAsk: () => void }) {
    return (
        <main className="mx-3.5 pt-10 pb-16 font-inter md:mx-8 md:pt-16 lg:mx-auto lg:max-w-6xl lg:px-8">
            <PageHeading title="Frequently asked" accent="questions">
                Quick answers about what MunchMate does, where its answers come from, and what it cannot
                do. For the full picture, see <Link to="/how-it-works" className="text-blue-500 underline underline-offset-4">how it works</Link>.
            </PageHeading>

            {/* <details> opens and closes on its own: no JavaScript needed, and
                it works with the keyboard and screen readers. */}
            <div className="max-w-3xl divide-y divide-gray-200 border-y border-gray-200 mt-10 md:mt-14">
                {FAQS.map((item) => (
                    <details key={item.q} className="group py-2">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-lg/7 font-medium tracking-tight md:text-xl/8 [&::-webkit-details-marker]:hidden">
                            {item.q}
                            {/* A plus that turns into a cross when open. */}
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-500 transition-transform group-open:rotate-45 motion-reduce:transition-none" aria-hidden="true">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                    <path d="M12 5v14M5 12h14" />
                                </svg>
                            </span>
                        </summary>
                        <p className="max-w-2xl pb-4 text-gray-500">{item.a}</p>
                    </details>
                ))}
            </div>

            <section className="mt-16 flex flex-col items-start gap-4 rounded-4xl bg-blue-50 p-6 md:mt-24 md:flex-row md:items-center md:justify-between md:p-10">
                <div>
                    <p className="font-spectral text-3xl/9 tracking-tight md:text-4xl/11">Still have a question?</p>
                    <p className="pt-2 text-gray-500">Ask MunchMate directly. It is free and needs no account.</p>
                </div>
                <button type="button" onClick={onAsk} className="rounded-full bg-black px-5 py-3 text-sm font-medium text-white hover:bg-gray-500">
                    Ask a question
                </button>
            </section>
        </main>
    )
}
