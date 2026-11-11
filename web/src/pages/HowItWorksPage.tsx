import { Link } from "../router"

// The steps from question to answer. Each one describes what the agent in
// agent.ts actually does; keep them in step if that changes.
const STEPS = [
    {
        title: "You ask a question",
        body: "Type it in plain words, up to 300 characters. Name the food and the medicine or condition, for example “Can a patient on warfarin eat sukuma wiki every day?”",
    },
    {
        title: "MunchMate checks it is a food question",
        body: "It answers questions about nutrition, food, diet and how medicines interact with food. Anything else, such as sport or the news, gets a short note saying it can only help with nutrition.",
    },
    {
        title: "It searches the web and Kenyan sources",
        body: "It runs up to three searches for each question, each looking at the top three results, so it reads up to nine pages. One search looks only at Kenyan government and research sites.",
    },
    {
        title: "It writes a short answer from what it found",
        body: "The answer comes first and stays short. It is written from the search results, not from memory, prefers affordable Kenyan foods, and points out food and medicine interactions that matter, such as vitamin K with warfarin or grapefruit with some transplant medicines.",
    },
    {
        title: "It shows its sources and its gaps",
        body: "Every answer ends with links to the pages it used. If the sources did not cover your exact food or medicine, a “What I could not confirm” note says what is missing, so you know what to check.",
    },
    {
        title: "You can ask follow-up questions",
        body: "The chat remembers your last five questions and answers, so you can say “what about for a child?” without repeating yourself. If an answer depends on something it was not told, like kidney function, it will ask.",
    },
]

// The sites the Kenyan search is limited to (KENYAN_DOMAINS in agent.ts).
const KENYAN_SOURCES = [
    { name: "Ministry of Health", site: "health.go.ke" },
    { name: "Division of Family Health", site: "familyhealth.go.ke" },
    { name: "Ministry of Agriculture", site: "kilimo.go.ke" },
    { name: "Kenya Medical Research Institute (KEMRI)", site: "kemri.go.ke" },
    { name: "Food and Agriculture Organization (FAO)", site: "fao.org" },
]

export default function HowItWorksPage({ onAsk }: { onAsk: () => void }) {
    return (
        <main className="mx-3.5 pt-10 pb-16 font-inter md:mx-8 md:pt-16 lg:mx-auto lg:max-w-6xl lg:px-8">
            <PageHeading title="How it works" accent="from question to answer">
                MunchMate is an AI assistant for one job: telling you whether a food is safe and sensible
                alongside a medicine or condition, and showing you where that advice comes from.
            </PageHeading>

            {/* The steps: one per row on phones, two per row from tablet up. */}
            <ol className="grid gap-4 pt-10 md:grid-cols-2 md:pt-14">
                {STEPS.map((step, index) => (
                    <li key={step.title} className="flex flex-col gap-4 rounded-4xl bg-blue-50 p-6 md:p-8">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500 font-medium text-white" aria-hidden="true">
                            {index + 1}
                        </span>
                        <h2 className="text-xl/7 font-medium tracking-tight md:text-2xl/8">{step.title}</h2>
                        <p className="text-gray-500">{step.body}</p>
                    </li>
                ))}
            </ol>

            <section className="pt-16 md:pt-24">
                <h2 className="text-3xl/7 font-semibold tracking-tight md:text-4xl/9">
                    Where the Kenyan<br></br><span className="text-blue-500">answers come from</span>
                </h2>
                <p className="max-w-2xl pt-4 text-gray-500">
                    For Kenyan foods and meals, one search looks only at these sites. Their results are
                    preferred when they answer the question. When no Kenyan source covers it, the answer
                    says it is based on international sources.
                </p>
                <ul className="flex flex-wrap gap-2 pt-6">
                    {KENYAN_SOURCES.map((source) => (
                        <li key={source.site} className="rounded-full border border-gray-200 px-4 py-2 text-sm">
                            {source.name} <span className="text-gray-400">· {source.site}</span>
                        </li>
                    ))}
                </ul>
            </section>

            {/* The safety note, set apart so it is hard to miss. */}
            <section className="mt-16 rounded-4xl border-2 border-black p-6 md:mt-24 md:p-10">
                <h2 className="text-2xl/8 font-semibold tracking-tight md:text-3xl/9">What MunchMate is not</h2>
                <p className="max-w-3xl pt-4 text-gray-500">
                    MunchMate gives general information. It is not a doctor, pharmacist or dietitian, and it
                    does not know your full medical history. Before you change a diet or a medicine, confirm
                    with your doctor, pharmacist or dietitian. If someone has a severe reaction, go to the
                    nearest health facility straight away.
                </p>
            </section>

            <section className="flex flex-col items-start gap-4 pt-16 md:flex-row md:items-center md:justify-between md:pt-24">
                <p className="font-spectral text-3xl/9 -tracking-wide md:text-4xl/11">Ready to try it?</p>
                <div className="flex flex-wrap gap-3">
                    <button type="button" onClick={onAsk} className="rounded-full bg-black px-5 py-3 text-sm font-medium text-white hover:bg-gray-500">
                        Ask a question
                    </button>
                    <Link to="/faq" className="rounded-full border border-gray-200 px-5 py-3 text-sm font-medium hover:bg-gray-100">
                        Read the FAQ
                    </Link>
                </div>
            </section>
        </main>
    )
}

/** The two-tone heading used at the top of each page, like "Why it works /
 *  for you" on the home page. */
export function PageHeading({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
    return (
        <header className="max-w-3xl">
            <h1 className="text-4xl/10 font-semibold tracking-tight md:text-5xl/14 lg:text-6xl/16">
                {title}<br></br><span className="text-blue-500">{accent}</span>
            </h1>
            <p className="pt-5 text-lg/7 text-gray-500 md:text-xl/8">{children}</p>
        </header>
    )
}
