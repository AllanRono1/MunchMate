import affordableMeal from "./assets/images/affordable-food.webp"
import browserApp from "./assets/images/browser-app.webp"
import nutritionSources from "./assets/images/nutrition-sources.webp"

const scrollData = [
    {
        id: 1,
        img: {
            src: nutritionSources,
            alt: "Several nutrition websites brought together into one answer"
        },
        heading: "Checks up to nine web pages for each question",
        details: "No more wandering from site to site. MunchMate brings food and medication guidance together in one place.",
        link: "/how-it-works"
    },
    {
        id: 2,
        img : {
            src: affordableMeal,
            alt: "A simple, low-cost Kenyan meal on a plate"
        },
        heading: "Recommends meals that fit your budget",
        details: "Get meal ideas built from affordable, local ingredients you can find at your nearest market.",
        link: "/how-it-works"
    },
    {
        id: 3,
        img : {
            src: browserApp,
            alt: "MunchMate open in a web browser on a phone"
        },
        heading: "Works right in your browser",
        details: "Nothing to download or install. Open MunchMate on any phone or computer and start asking.",
        link: "/how-it-works"
    }
]
export default scrollData