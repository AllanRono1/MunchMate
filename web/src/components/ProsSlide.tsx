import { Link } from "../router"

type SlideProps = {
    src: string
    alt: string
    heading: string
    details: string
    link: string
}

/** One slide in the "Why it works for you" row on the home page. */
export default function ProsSlide({src, alt, heading, details, link}: SlideProps) {
    return(
        <div className="shrink-0 basis-4/5 snap-start md:basis-[45%] lg:shrink lg:basis-0 lg:grow">
            <img className="h-80 w-full object-cover rounded-4xl mb-5 lg:h-96" srcSet={src} alt={alt} />
            <div className="max-w-[90%]">
                <h2 className="text-2xl/7 tracking-tight pb-4 font-medium">{heading}</h2>
                <p className="text-gray-400 pb-4">{details}</p>
                <Link to={link} className="font-medium underline-offset-4 hover:underline">how it works</Link>
            </div>
        </div>
    )
}
