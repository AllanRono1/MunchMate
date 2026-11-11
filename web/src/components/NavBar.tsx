import { useEffect, useState } from "react"
import { Link } from "../router"
import MunchMateLogo from "../assets/logo/munch-mate-mark-capsule-stack.svg"

// The pages listed in the navigation, in order.
export const NAV_LINKS = [
    { to: "/how-it-works", label: "How it works" },
    { to: "/faq", label: "FAQ" },
]

type NavBarProps = {
    path: string
    // Moves the visitor to a question box.
    onAsk: () => void
}

/**
 * The bar along the top of every page. On tablet and desktop the links sit in
 * the bar; on phones they fold into a menu opened by the button on the right.
 */
export default function NavBar({ path, onAsk }: NavBarProps) {
    const [menuOpen, setMenuOpen] = useState(false)

    // Close the phone menu whenever the page changes, and with Escape.
    useEffect(() => setMenuOpen(false), [path])
    useEffect(() => {
        if (!menuOpen) return
        const onKey = (event: KeyboardEvent) => event.key === "Escape" && setMenuOpen(false)
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [menuOpen])

    function ask() {
        setMenuOpen(false)
        onAsk()
    }

    return (
        <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/85 font-inter backdrop-blur">
            <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-8" aria-label="Main">
                {/* Just the logo. Its alt text names the link for screen readers,
                    now that there is no title beside it. */}
                <Link to="/" className="flex items-center" aria-current={path === "/" ? "page" : undefined}>
                    <img className="h-8" src={MunchMateLogo} alt="MunchMate home" />
                </Link>

                {/* Tablet and desktop: links and the Ask button in the bar. */}
                <div className="hidden items-center gap-8 md:flex">
                    {NAV_LINKS.map((link) => (
                        <NavLink key={link.to} {...link} active={path === link.to} />
                    ))}
                    <AskButton onClick={ask} />
                </div>

                {/* Phones: a menu button. */}
                <button
                    type="button"
                    className="rounded-full p-2 hover:bg-gray-100 md:hidden"
                    aria-expanded={menuOpen}
                    aria-controls="mobile-menu"
                    aria-label={menuOpen ? "Close menu" : "Open menu"}
                    onClick={() => setMenuOpen((open) => !open)}
                >
                    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
                    </svg>
                </button>
            </nav>

            {/* The phone menu, under the bar. */}
            {menuOpen && (
                <div id="mobile-menu" className="border-t border-gray-100 bg-white px-4 pt-2 pb-5 md:hidden">
                    <ul className="flex flex-col">
                        {NAV_LINKS.map((link) => (
                            <li key={link.to}>
                                <Link
                                    to={link.to}
                                    aria-current={path === link.to ? "page" : undefined}
                                    className={`block py-3 font-spectral text-3xl -tracking-wider ${path === link.to ? "text-blue-500" : ""}`}
                                >
                                    {link.label}
                                </Link>
                            </li>
                        ))}
                    </ul>
                    <AskButton onClick={ask} className="mt-3 w-full" />
                </div>
            )}
        </header>
    )
}

function NavLink({ to, label, active }: { to: string; label: string; active: boolean }) {
    return (
        <Link
            to={to}
            aria-current={active ? "page" : undefined}
            className={`text-sm hover:text-blue-500 ${active ? "font-medium text-blue-500" : "text-gray-500"}`}
        >
            {label}
        </Link>
    )
}

/** The black pill button, matching the site's Send buttons. */
function AskButton({ onClick, className = "" }: { onClick: () => void; className?: string }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`rounded-full bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-500 ${className}`}
        >
            Ask a question
        </button>
    )
}
