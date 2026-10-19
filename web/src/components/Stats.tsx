type StatProps = {
    record: string
    unit?: string
    title: string
    description: string
}

export default function({record, title, description, unit}: StatProps) {
    return(
        <div className="min-h-[85vh] w-[94vw] mx-auto p-5 mb-3 border border-solid border-cream shadow-sm rounded-3xl flex flex-col justify-between bg-image bg-linear-to-b from-blue-500 from-30% via-blue-400 via-60% via-blue-300 via-70% via-white via-80% to-white] font-inter">
            <div>
                <h2 className="text-5xl text-white">{record}<sup className="text-2xl">{unit}</sup></h2>
            </div>
            <div>
                <p className="text-base/5 font- tracking-tight pb-1">{title}</p>
                <p className="text-sm tracking-tight text-gray-400">{description}</p>
            </div>
        </div>
    )
}