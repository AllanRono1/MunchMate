import type { FormEvent, Ref } from "react"
import QuestionForm from "../components/QuestionForm"
import Stats from "../components/Stats"
import ProsSlide from "../components/ProsSlide"
import Testimonials from "../components/Testimonials"
import data from "../data"
import scrollData from "../scrollDetails"
import videoMP4Desktop from '../assets/videos/wind_blowing_on_woman_desktop.mp4'
import videoMP4Mobile from '../assets/videos/wind_blowing_on_woman_mobile.mp4'
import videoWEBMDesktop from '../assets/videos/wind_blowing_on_womanWEBM_desktop.webm'
import videoWEBMobile from '../assets/videos/wind_blowing_on_womanWEBM_mobile.webm'
import FAOLogo from "../assets/icons/FAO_logo.webp"
import MohLogo from "../assets/icons/MoHKenyaLogo.webp"
import WHOlogo from "../assets/icons/who-emblem.webp"

type HomePageProps = {
    draft: string
    setDraft: (text: string) => void
    onSubmit: (event: FormEvent<HTMLFormElement>) => void
    // Watched by App to know when the hero box has scrolled away.
    heroFormRef: Ref<HTMLDivElement>
    heroTextareaRef: Ref<HTMLTextAreaElement>
}

export default function HomePage({ draft, setDraft, onSubmit, heroFormRef, heroTextareaRef }: HomePageProps) {
    const patientData = data.map(patient => {
        return <Stats key={patient.id} record={patient.record} unit={patient.unit} title={patient.title} description={patient.description}/>
    })
    const webPros = scrollData.map(item => {
        return <ProsSlide key={item.id} src={item.img.src} alt={item.img.alt} heading={item.heading} details={item.details} link={item.link}/>
    })
    return(
        <main>
            {/* The hero fills the screen, less a small margin top and bottom;
                the nav bar floats over its top. svh ignores the phone's
                address bar, so the box never hides behind it. */}
            <section className="max-w-[95vw] mx-auto min-h-[calc(100svh-1.5rem)] text-center mt-3 bg-cream flex flex-col justify-end relative font-inter">
                <div className="w-[95vw] h-[calc(100svh-1.5rem)] overflow-hidden rounded-2xl md:rounded-4xl">
                    <video className="h-full w-full object-cover" loop autoPlay muted playsInline>
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
                {/* inset-x-0 + mx-auto + max-w keep the text and box centred
                    and at a readable width on wide screens. */}
                <div className="absolute inset-x-0 bottom-3 mx-auto max-w-[98.5%] md:bottom-10 md:max-w-2xl lg:bottom-14 lg:max-w-3xl">
                    <h1 className=" text-white text-2xl/7 tracking-tight font-medium md:text-4xl/10 lg:text-5xl/14">A new level of confidence when eating with your medication</h1>
                    <p className="text-cream text-sm/4 py-4 md:text-base md:py-5">Whatever you're eating with your medication, start here.</p>
                    <div ref={heroFormRef}>
                        <QuestionForm draft={draft} setDraft={setDraft} onSubmit={onSubmit} textareaRef={heroTextareaRef} />
                    </div>
                </div>
            </section>
            <section className="max-w-[80vw] mx-auto text-3xl/8 tracking-tighter py-12 md:text-4xl/11 md:py-20 lg:max-w-5xl lg:text-5xl/14 lg:py-28">
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
            {/* Phones: one card per row. Tablet and up: two per row. */}
            <section className="pb-12 md:grid md:grid-cols-2 md:gap-4 md:px-8 md:pb-20 lg:mx-auto lg:max-w-6xl">
                {patientData}
            </section>
            <section className="ml-3.5 mr-3.5 pb-10 md:mx-8 lg:mx-auto lg:max-w-6xl lg:px-8">
                <h2 className="text-3xl/7 tracking-tight pb-5 font-semibold md:text-4xl/9 lg:text-5xl/12">Why it works<br></br><span className="text-blue-500">for you</span></h2>
                {/* Phones and tablets swipe through the slides; on desktop all
                    three fit side by side. */}
                <div className="font-inter pb-12 flex flex-nowrap overflow-x-auto gap-4 snap-x snap-mandatory overscroll-x-contain lg:overflow-visible lg:gap-6">
                    {webPros}
                </div>
            </section>
            <Testimonials />
        </main>
    )
}
