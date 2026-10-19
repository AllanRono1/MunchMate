/**
 * Sends one message to the agent and returns its answer (written in Markdown).
 *
 * threadId is the conversation's ID. The server keeps a separate memory for
 * each ID, so sending the same one with every message is what lets the agent
 * remember what was said earlier.
 *
 * If anything goes wrong this throws an Error whose message is written for
 * the visitor to read.
 */
export async function askAgent(threadId: string, message: string): Promise<string> {
    // fetch itself only fails when no response came back at all: the server
    // is down or the connection dropped.
    const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, message }),
    }).catch((cause) => {
        throw new Error("Could not reach the server. Please try again.", { cause })
    })

    // Our server always answers in JSON. If the reply is not JSON, it came
    // from something in front of our server (for example Render's own error
    // page while the app restarts).
    const data = await response.json().catch((cause) => {
        throw new Error(
            `The server is not available right now (error ${response.status}). Please try again in a minute.`,
            { cause },
        )
    })

    if (!response.ok) {
        throw new Error(data.error || "Something went wrong.")
    }

    return data.reply
}
