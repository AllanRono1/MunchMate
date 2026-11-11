type StatProps = {
    record: string
    unit?: string
    title: string
    description: string
}

/** One statistic card: a big number on a blue-to-white fade, with a title
 *  and a short explanation at the bottom. */
export default function Stats({record, title, description, unit}: StatProps) {
    return(
        <div className="min-h-[85vh] w-[94vw] mx-auto p-5 mb-3 md:min-h-[55vh] md:w-auto md:mb-0 md:p-8 lg:min-h-[65vh] border border-cream shadow-sm rounded-3xl flex flex-col justify-between bg-linear-to-b from-blue-500 from-30% via-white via-80% to-white font-inter">
            <div>
                <h2 className="text-5xl text-white lg:text-7xl">{record}<sup className="text-2xl lg:text-4xl">{unit}</sup></h2>
            </div>
            <div>
                <p className="text-base/5 tracking-tight pb-1 lg:text-xl/7">{title}</p>
                <p className="text-sm tracking-tight text-gray-400 lg:text-base">{description}</p>
            </div>
        </div>
    )
}
