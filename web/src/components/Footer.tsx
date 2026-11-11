import { Link } from "../router"
import { NAV_LINKS } from "./NavBar"
import MunchMateLogo from "../assets/logo/munch-mate-mark-capsule-stack.svg"

// The footer's links use the long name for the FAQ.
const LABELS: Record<string, string> = { "/faq": "Frequently asked questions" }

/** The bottom of every page: the page links and the brand. */
export default function Footer() {
    return (
        // mb-32 leaves room so the fixed question box never covers the end
        // of the footer.
        <footer className="mb-32">
            <nav aria-label="Footer">
                <ul className="text-center font-spectral text-4xl/10 -tracking-widest p-12 md:text-5xl/14 lg:text-6xl/16">
                    {NAV_LINKS.map((link) => (
                        <li key={link.to}>
                            <Link to={link.to} className="hover:text-blue-500">{LABELS[link.to] ?? link.label}</Link>
                        </li>
                    ))}
                </ul>
            </nav>
            <div className="text-center relative">
                <h2 className="font-spectral text-6xl/12 -tracking-widest pb-5">Munch Mate</h2>
                <img className="h-8 absolute left-1/2 -translate-x-1/2" src={MunchMateLogo} alt="Munch Mate Logo"/>
            </div>
        </footer>
    )
}
