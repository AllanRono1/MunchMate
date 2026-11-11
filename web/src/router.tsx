import { useEffect, useState, type MouseEvent, type ReactNode } from "react"

/**
 * A very small router: the site only has a few pages, so instead of adding a
 * routing library we read the address bar ourselves.
 *
 * - usePath() returns the current path, for example "/faq", and redraws the
 *   page whenever it changes.
 * - navigate("/faq") changes the address without reloading the page.
 * - <Link to="/faq"> is a normal link that uses navigate() when clicked.
 */

// Fired by navigate(), so every usePath() hears about the change. (The
// browser only fires "popstate" for Back and Forward, not for pushState.)
const NAVIGATE_EVENT = "munchmate:navigate"

export function usePath() {
    const [path, setPath] = useState(window.location.pathname)

    useEffect(() => {
        const update = () => setPath(window.location.pathname)
        // Back/Forward buttons, and our own navigate().
        window.addEventListener("popstate", update)
        window.addEventListener(NAVIGATE_EVENT, update)
        return () => {
            window.removeEventListener("popstate", update)
            window.removeEventListener(NAVIGATE_EVENT, update)
        }
    }, [])

    return path
}

/** Goes to another page of the site without reloading it. */
export function navigate(to: string) {
    if (to !== window.location.pathname) {
        window.history.pushState({}, "", to)
        window.dispatchEvent(new Event(NAVIGATE_EVENT))
    }
    // A new page starts at the top, like a normal link would.
    window.scrollTo(0, 0)
}

type LinkProps = {
    to: string
    className?: string
    children: ReactNode
    onClick?: () => void
    "aria-current"?: "page" | undefined
}

/** A link to another page of the site. */
export function Link({ to, className, children, onClick, ...rest }: LinkProps) {
    function handleClick(event: MouseEvent<HTMLAnchorElement>) {
        // Let Ctrl/Cmd/Shift-click and middle-click open a new tab as usual.
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        event.preventDefault()
        onClick?.()
        navigate(to)
    }

    return (
        <a href={to} className={className} onClick={handleClick} {...rest}>
            {children}
        </a>
    )
}
