import { useState } from "react"
import testimonials from "../testimonials"

/** Turns "Jane Wanjiru" into "JW", for when there is no avatar photo. */
function initials(name: string) {
    return name
        .split(/\s+/)
        .map((word) => word[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
}

/**
 * One testimonial at a time, as a quote card. The arrows and dots move
 * between testimonials.
 */
export default function Testimonials() {
    // Which testimonial is showing.
    const [index, setIndex] = useState(0)
    const count = testimonials.length

    // Wrap around at both ends, so "next" on the last one goes to the first.
    const go = (step: number) => setIndex((i) => (i + step + count) % count)

    const current = testimonials[index]
    // Only happens if the testimonials list is empty: show nothing.
    if (!current) return null

    return (
        <section className="mx-3.5 pb-16 font-inter md:mx-8 lg:mx-auto lg:max-w-6xl lg:px-8" aria-roledescription="carousel" aria-label="How people use MunchMate">

            {/* key={current.id} makes React rebuild this block on each change,
                which replays the fade-in animation. */}
            <div key={current.id} className="testimonial-fade" aria-live="polite">
                <figure className="flex flex-col justify-between gap-10 rounded-4xl bg-blue-50 p-6 md:p-10">
                    {/* A large quotation mark, as decoration only. */}
                    <svg className="h-10 w-10 text-blue-500" viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
                        <path d="M9.3 25.5c-3.6 0-6.3-2.8-6.3-6.8C3 12.6 7.4 7.4 13 6l1.2 2.3c-3.4 1.4-5.5 4.2-5.8 6.9 3 .1 5.3 2.4 5.3 5.3 0 2.8-2 5-4.4 5Zm15.4 0c-3.6 0-6.3-2.8-6.3-6.8 0-6.1 4.4-11.3 10-12.7l1.2 2.3c-3.4 1.4-5.5 4.2-5.8 6.9 3 .1 5.3 2.4 5.3 5.3 0 2.8-2 5-4.4 5Z" />
                    </svg>
                    {/* max-w keeps lines a comfortable length on wide screens. */}
                    <blockquote className="max-w-4xl text-xl/8 tracking-tight md:text-2xl/9 lg:text-3xl/11">
                        “{current.quote}”
                    </blockquote>
                    <figcaption className="flex items-center gap-3">
                        {current.avatar ? (
                            <img className="h-12 w-12 rounded-full object-cover" src={current.avatar} alt="" />
                        ) : (
                            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-500 font-medium text-white" aria-hidden="true">
                                {initials(current.name)}
                            </span>
                        )}
                        <span>
                            <span className="block font-medium">{current.name}</span>
                            <span className="block text-sm text-gray-400">{current.role}</span>
                        </span>
                    </figcaption>
                </figure>
            </div>

            {/* The arrows, with one dot per testimonial between them. */}
            <div className="flex items-center justify-between pt-5">
                <ArrowButton direction="previous" onClick={() => go(-1)} />
                <div className="flex gap-2">
                    {testimonials.map((t, i) => (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => setIndex(i)}
                            aria-label={`Show testimonial ${i + 1} of ${count}`}
                            aria-current={i === index}
                            className={`h-2 rounded-full transition-all ${i === index ? "w-6 bg-blue-500" : "w-2 bg-gray-200"}`}
                        />
                    ))}
                </div>
                <ArrowButton direction="next" onClick={() => go(1)} />
            </div>

            {/* Remove this once the examples are replaced with real reviews. */}
            <p className="pt-4 text-center text-xs text-gray-400">
                Illustrative examples of how people use MunchMate, not reviews from real users.
            </p>
        </section>
    )
}

type ArrowButtonProps = {
    direction: "previous" | "next"
    onClick: () => void
    className?: string
}

/** A round black arrow button, matching the Send button in the hero. */
function ArrowButton({ direction, onClick, className = "" }: ArrowButtonProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={`${direction === "next" ? "Next" : "Previous"} testimonial`}
            className={`rounded-full bg-black p-3 text-white hover:bg-gray-500 ${className}`}
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
                strokeLinejoin="round"
                className={direction === "previous" ? "rotate-180" : ""}
            >
                <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
        </button>
    )
}
