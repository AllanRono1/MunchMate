import { useEffect, useState } from "react"
import { Link } from "../router"
import MunchMateLogo from "../assets/logo/munch-mate-mark-capsule-stack.svg"

// The pages listed in the navigation, in order.
export const NAV_LINKS = [
    { to: "/how-it-works", label: "How it works" },
    { to: "/faq", label: "FAQ" },
]

// Frosted glass: a see-through white with the page blurred behind it, a
// thin light edge and a soft shadow so it stands out on white pages too.
const GLASS = "border border-white/60 bg-white/50 shadow-[0_4px_24px_rgba(0,0,0,0.08)] backdrop-blur-xl"

type NavBarProps = {
    path: string
    // Moves the visitor to a question box.
    onAsk: () => void
}

/**
 * The bar along the top of every page. The bar itself is see-through: the
 * logo sits straight on the page, and the controls sit in a glass pill. On
 * tablet and desktop the pill holds the links; on phones it is a "Menu"
 * button that opens a glass panel with them.
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

    // Hide the bar while the visitor scrolls down, and bring it back as soon
    // as they scroll up.
    const [hidden, setHidden] = useState(false)
    useEffect(() => {
        let lastY = window.scrollY
        let frame = 0
        function onScroll() {
            // Work at most once per screen redraw, not on every scroll event.
            if (frame) return
            frame = requestAnimationFrame(() => {
                frame = 0
                const y = window.scrollY
                const change = y - lastY
                // Ignore tiny movements (a shaky finger, or the bounce at the
                // end of a page on phones) so the bar does not flicker.
                if (Math.abs(change) < 8) return
                // Always show it near the top of the page.
                setHidden(change > 0 && y > 80)
                lastY = y
            })
        }
        window.addEventListener("scroll", onScroll, { passive: true })
        return () => {
            window.removeEventListener("scroll", onScroll)
            cancelAnimationFrame(frame)
        }
    }, [])

    // Keep it visible while the phone menu is open.
    const showBar = !hidden || menuOpen

    function ask() {
        setMenuOpen(false)
        onAsk()
    }

    return (
        // fixed (not sticky) takes the bar out of the page flow, so it floats
        // over the hero video instead of pushing it down. z-40 keeps it above
        // the video and the bottom question box (z-20).
        // top-3 and px-6 inset the logo and pill a little, so they sit inside
        // the hero video's rounded corner rather than on its edge.
        // When hidden it slides up past the top of the screen. onFocus brings it
        // back if a keyboard user tabs into it while it is hidden.
        <header
            onFocus={() => setHidden(false)}
            className={`fixed inset-x-0 top-3 z-40 font-inter transition-transform duration-300 motion-reduce:transition-none ${showBar ? "translate-y-0" : "-translate-y-[150%]"}`}
        >
            <nav className="relative mx-auto flex h-16 max-w-6xl items-center justify-between px-6 md:px-10" aria-label="Main">
                {/* Just the logo, with no background. Its alt text names the
                    link for screen readers. */}
                <Link to="/" className="flex items-center" aria-current={path === "/" ? "page" : undefined}>
                    <img className="h-8" src={MunchMateLogo} alt="MunchMate home" />
                </Link>

                {/* Tablet and desktop: the links and Ask button in a glass pill. */}
                <div className={`hidden items-center gap-6 rounded-full py-1.5 pr-1.5 pl-5 md:flex ${GLASS}`}>
                    {NAV_LINKS.map((link) => (
                        <NavLink key={link.to} {...link} active={path === link.to} />
                    ))}
                    <AskButton onClick={ask} />
                </div>

                {/* Phones: a glass "Menu" button. */}
                <button
                    type="button"
                    className={`rounded-full px-4 py-2 text-sm font-medium md:hidden ${GLASS}`}
                    aria-expanded={menuOpen}
                    aria-controls="mobile-menu"
                    onClick={() => setMenuOpen((open) => !open)}
                >
                    {menuOpen ? "Close" : "Menu"}
                </button>

                {/* The phone menu: a glass panel that drops down over the page
                    under the Menu button. */}
                {menuOpen && (
                    <div id="mobile-menu" className={`absolute top-full right-4 left-4 rounded-4xl p-5 md:hidden ${GLASS}`}>
                        <ul className="flex flex-col">
                            {NAV_LINKS.map((link) => (
                                <li key={link.to}>
                                    <Link
                                        to={link.to}
                                        aria-current={path === link.to ? "page" : undefined}
                                        className={`block py-2 font-spectral text-3xl tracking-tighter ${path === link.to ? "text-blue-500" : ""}`}
                                    >
                                        {link.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                        <AskButton onClick={ask} className="mt-4 w-full py-3" />
                    </div>
                )}
            </nav>
        </header>
    )
}

function NavLink({ to, label, active }: { to: string; label: string; active: boolean }) {
    return (
        <Link
            to={to}
            aria-current={active ? "page" : undefined}
            className={`text-sm hover:text-blue-500 ${active ? "font-medium text-blue-500" : "text-black"}`}
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
