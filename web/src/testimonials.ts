export type Testimonial = {
    id: number
    quote: string
    name: string
    role: string
    // Optional small round photo of the person. Without it, their initials
    // are shown instead.
    avatar?: string
}

// ILLUSTRATIVE EXAMPLES, not real reviews. They show how a nutritionist, a
// caregiver and someone with diabetes might use MunchMate, and the page says
// so under the slider. Replace them with real feedback (with each person's
// permission) as it comes in, then remove that note from Testimonials.tsx.
const testimonials: Testimonial[] = [
    {
        id: 1,
        quote: "Patients ask me about food and their medicines between appointments. MunchMate gives them a short answer with the Ministry of Health and FAO sources linked, so I can see exactly where the advice came from.",
        name: "Nutritionist",
        role: "Clinical nutrition, Nairobi",
    },
    {
        id: 2,
        quote: "My mother takes warfarin and loves sukuma wiki. Instead of guessing, I asked MunchMate and learned to keep her greens steady from day to day, with links I could show her doctor.",
        name: "Caregiver",
        role: "Looks after a parent on warfarin, Nakuru",
    },
    {
        id: 3,
        quote: "I check how a meal fits with my metformin and my blood sugar before I go to the market. The answers talk about foods I actually buy, and asking costs me nothing.",
        name: "Living with diabetes",
        role: "Type 2 diabetes, Kisumu",
    },
]

export default testimonials
