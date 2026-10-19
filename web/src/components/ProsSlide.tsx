type SlideProps = {
    src: string
    alt: string
    heading: string
    details: string
    link: string
}

export default function ProsSlide({src, alt, heading, details, link}: SlideProps) {
    return(
                <div className="shrink-0 basis-4/5 snap-start">
                    <img className="h-80 object-cover rounded-4xl mb-5" srcSet={src} alt={alt} />
                    <div className="max-w-[90%]">
                        <h2 className="text-2xl/7 tracking-tight pb-4 font-medium">{heading}</h2>
                        <p className=" text-gray-400 pb-4">{details}</p>
                        <a className="font-medium" href={link}>how it works</a>
                    </div>
                </div>
    )
} 