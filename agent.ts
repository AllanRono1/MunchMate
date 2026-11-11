import { StateGraph, Annotation, END, MemorySaver } from "@langchain/langgraph"
import { ChatOpenAI } from "@langchain/openai"
import { ToolMessage, type BaseMessageLike } from "@langchain/core/messages"
import { tavily } from "@tavily/core"
import * as dotenv from "dotenv"

//used to read content of .env file and loads its key-value pair into the
//  process.env so that the rest of the code can read them

dotenv.config()

if(!process.env.TAVILY_API_KEY) {
    throw new Error("TAVILY_API_KEY is not set")
}
//save the tavily api key as a key-value pair inside an object

const tavilyClient = tavily({apiKey: process.env.TAVILY_API_KEY})

// Connect to the OpenRouter Nemotron endpoint. The ":free" at the end of the
// model name is what selects the free version; without it OpenRouter charges
// for each request. Created once here so that both graphs share the same
// model.
// (nvidia/nemotron-3-super-120b-a12b:free was withdrawn from the free tier
// in November 2026, so we use the newer Nemotron 3.5 Super instead.)
export const model = new ChatOpenAI({
    configuration: {baseURL: "https://openrouter.ai/api/v1"},
    modelName: "nvidia/nemotron-3.5-super-vl:free",
    apiKey: process.env.OPENROUTER_API_KEY
})


// The project has two separate graphs:
//
//   1. The REPORT graph (researcher -> author), in report.ts. It writes one
//      long report and is only used from the terminal, with `npm run report`.
//   2. The CHAT graph, in this file. It follows the same researcher -> author
//      architecture, but answers one specific question at a time and
//      remembers the conversation. This is what the website uses.
//
// In both graphs the researcher component of the agent implements the reasoning and action pattern (see `research` below):
// the model thinks what to do, takes action(decides what to search for), reads the results, and decides
// the next steps based on the results. Each graph has its own state, because they need
// to remember different things. The search tools and the ReAct loop are
// shared, so they come first and are exported for report.ts.

/**
 * Removes duplicate and near-duplicate snippets from a list of search result
 * content strings. This matters here because several of the researcher's
 * queries overlap in topic (e.g. "renal restrictions" and "drug-nutrient
 * interactions" can both surface the same source page), so Tavily can return
 * the same snippet more than once across different queries.
 *
 * @param snippets - Raw content strings pulled from Tavily search results,
 *   one per hit, possibly containing duplicates across queries.
 * @returns The snippets with duplicates removed, preserving the order of
 *   first appearance.
 */
function dedupeSnippets(snippets: string[]): string[] {
    // Tracks a normalized version of every snippet we've already kept, so we
    // can check for repeats in O(1) instead of comparing every pair.
    const seen = new Set<string>()
    //stores the final, unique snippets to return to the user
    const deduped: string[] = []

    for (const snippet of snippets) {
        // Normalize before comparing: lowercase + collapsed whitespace means
        // two snippets that differ only by capitalization or line breaks are
        // still treated as the same underlying content.
        // const key = snippet.trim().toLowerCase().replace(/\s+/g, " ");
        const key = snippet.trim().toLowerCase().replace(/\s+/g, " ")
        if (key && !seen.has(key)) {
            seen.add(key);
            deduped.push(snippet.trim());
        }
    }

    return deduped;
}

// Tavily rejects search queries longer than 400 characters.
const MAX_SEARCH_QUERY_LENGTH = 400

// How many results each search asks Tavily for.
const RESULTS_PER_SEARCH = 3

// The most times the researcher may go round its loop (think, search, read
// the results) for one question or report. The search limit normally ends
// the loop first; this is a backstop in case the model keeps asking for
// searches that are never run (for example with an empty query).
const MAX_RESEARCH_ROUNDS = 6

// The Kenyan search only looks at these sites. A normal web search for a
// food question mostly returns American and British pages, which describe
// foods and portions a Kenyan patient may not recognise. These are the
// Kenyan government and research bodies that publish nutrition guidance
// (for example the Ministry of Health's National Guidelines for Healthy
// Diets and the Kenya Food Composition Tables), plus the FAO, which
// co-publishes several of them.
const KENYAN_DOMAINS = [
    "health.go.ke", //Ministry of Health
    "familyhealth.go.ke", //Ministry of Health, Division of Family Health
    "kilimo.go.ke", //Ministry of Agriculture
    "kemri.go.ke", //Kenya Medical Research Institute
    "fao.org", //Food and Agriculture Organization
]

// Put on the first line of every snippet that came from the Kenyan search,
// so the author can tell Kenyan sources apart from the rest.
export const KENYAN_LABEL = "[Kenyan source]"

// Tavily scores every result from 0 (unrelated) to 1 (a close match). The
// Kenyan search is limited to a handful of sites, so when none of them
// covers the question it still returns its "best" pages, which can be about
// something else entirely (a farming factsheet for a warfarin question).
// Results below this score are dropped, so that an unrelated page is never
// passed to the author as Kenyan evidence.
const MIN_KENYAN_SCORE = 0.4

// The tools the researcher can call, written in the format the model
// expects. The model never runs a search itself: it replies with a "tool
// call" naming one of these tools and the query it wants, and `research`
// runs the search and sends the results back to it.
export const WEB_SEARCH_TOOL = "web_search"
export const KENYAN_SEARCH_TOOL = "search_kenyan_sources"

const SEARCH_TOOLS = [
    {
        type: "function" as const,
        function: {
            name: WEB_SEARCH_TOOL,
            description: "Search the whole web. Returns the title, link and text of the top results.",
            parameters: {
                type: "object",
                properties: {
                    query: { 
                        type: "string", 
                        description: "A specific search query that makes sense on its own."
                     },
                },
                required: ["query"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: KENYAN_SEARCH_TOOL,
            description: "Search only Kenyan government and research sites (Ministry of Health, Ministry of Agriculture, KEMRI) and the FAO. Returns the title, link and text of the top results.",
            // Must be "parameters" (plural): with any other name the model is
            // never told this tool takes a query, so it calls it with none.
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "A specific search query that makes sense on its own"
                    }
                },
                required: ["query"]
            }
        }
    },
]

// The same model, but told about the search tools, so it can ask for them.
const researcherModel = model.bindTools(SEARCH_TOOLS)

/**
 * Runs one Tavily search and turns the results into snippets for the
 * author. Each snippet keeps its title and link in front of its text, so
 * the author can tell the reader where a fact came from. Snippets from the
 * Kenyan search also get KENYAN_LABEL as their first line, and are kept only
 * if they are relevant enough (see MIN_KENYAN_SCORE).
 *
 * @param query - What to search for.
 * @param kenyan - Whether to search only the Kenyan sites.
 * @returns The snippets, best match first. Empty if nothing was found.
 */
async function search(query: string, kenyan: boolean): Promise<string[]> {
    const response = await tavilyClient.search(query.slice(0, MAX_SEARCH_QUERY_LENGTH), {
        maxResults: RESULTS_PER_SEARCH,
        ...(kenyan ? { includeDomains: KENYAN_DOMAINS } : {}),
    })
    const label = kenyan ? `${KENYAN_LABEL}\n` : ""
    return response.results
        ?.filter((res) => !kenyan || res.score >= MIN_KENYAN_SCORE)
        .map((res) => `${label}${res.title}\nLink: ${res.url}\n${res.content.trim()}`) || []
}

/**
 * The researcher, as a ReAct agent ("reason + act"). Both graphs' researcher
 * nodes call this; they only differ in the instructions they give it.
 *
 * It works in rounds:
 *   1. Reason: the model reads the task (and every result so far) and
 *      decides what is still missing. It answers with one or more tool
 *      calls, each one a search it wants run.
 *   2. Act: we run those searches (at the same time) and send the results
 *      back to the model as "tool" messages.
 *   3. Repeat, until the model stops asking for searches because it has
 *      enough, or the search limit is reached.
 *
 * The model's own final words are not used: the author writes from the
 * snippets the searches returned, not from the researcher's summary of them.
 *
 * The loop runs inside this one function, rather than as a loop of nodes in
 * the graph, so its working notes (the tool calls and results) are thrown
 * away when it finishes. In the chat graph, anything in the graph state is
 * saved between messages, and these notes are not worth keeping.
 *
 * One search is always kept back for the Kenyan sites. If the model never
 * searched them itself, its first web query is run again there, so the
 * author always has local guidance to draw on (or knows there was none).
 *
 * @param instructions - The system prompt: what to research and how.
 * @param conversation - The messages that state the task (for the chat, the
 *   recent conversation followed by the new question).
 * @param maxSearches - The most searches to run, including the Kenyan one.
 *   Every search is one Tavily request, so this is also the most it costs.
 * @param fallbackQuery - What to search for if the model fails before it
 *   searches anything, so the author still has something to work from.
 * @param maxRounds - The most times to ask the model what to search. Every
 *   round is one model call, and each can take 20 to 30 seconds on the free
 *   model, so the chat uses 1: the model plans all its searches at once, and
 *   we skip the extra call where it reads the results and usually just says
 *   it has enough. The report keeps several rounds, since it is not waited
 *   on live.
 * @returns The deduplicated snippets from every search that was run. Empty
 *   if the model decided no search was needed.
 */
export async function research(
    instructions: string,
    conversation: BaseMessageLike[],//(union type - allows loose and flexible shorthand inputs) rep an array of objects that can be converted to chat messages
    maxSearches: number,
    fallbackQuery: string,
    maxRounds: number = MAX_RESEARCH_ROUNDS
): Promise<string[]> {
    // Everything the model has seen so far. It grows each round with the
    // model's tool calls and the results we send back.
    const messages: BaseMessageLike[] = [{ role: "system", content: instructions }, ...conversation]

    const snippets: string[] = []
    const searchesRun: { query: string, kenyan: boolean }[] = []
    let searchesLeft = maxSearches - 1 //one is kept back for the Kenyan search
    let modelFailed = false

    for (let round = 0; round < maxRounds && searchesLeft > 0; round++) {
        // 1. Reason: ask the model what to search for next.
        let response
        try {
            response = await researcherModel.invoke(messages)
        } catch (error) {
            console.warn("The researcher model failed:", error)
            modelFailed = true
            break
        }

        // No tool calls means the model has decided it has enough.
        const toolCalls = response.tool_calls ?? []
        if (toolCalls.length === 0) {
            break
        }
        messages.push(response)

        // 2. Act: run every search it asked for. Each call is checked first,
        // and given its place in the search limit, before any of them start.
        const results = await Promise.all(toolCalls.map(async (call) => {
            const query = typeof call.args.query === "string" ? call.args.query.trim() : ""
            const kenyan = call.name === KENYAN_SEARCH_TOOL

            if (call.name !== WEB_SEARCH_TOOL && !kenyan) {
                return `Not run: there is no tool called "${call.name}".`
            }
            if (!query) {
                return "Not run: the query was empty."
            }
            if (searchesLeft === 0) {
                return "Not run: the search limit has been reached."
            }
            searchesLeft--
            searchesRun.push({ query, kenyan })
            console.log(`Search (${call.name}):`, query)

            try {
                const found = await search(query, kenyan)
                snippets.push(...found)
                return found.join("\n\n") || "No relevant results were found."
            } catch (error) {
                console.warn(`Search failed for query "${query}":`, error)
                return "The search failed."
            }
        }))

        // 3. Send the results back, so the model can read them next round.
        // Each result has to name the tool call it answers.
        toolCalls.forEach((call, i) => {
            messages.push(new ToolMessage({ tool_call_id: call.id ?? "", content: results[i] ?? "" }))
        })
    }

    // If the model broke before it could search anything, search for the
    // task exactly as it was given, so the author still has an answer to
    // work from.
    if (modelFailed && searchesRun.length === 0) {
        searchesRun.push({ query: fallbackQuery, kenyan: false })
        console.log(`Search (${WEB_SEARCH_TOOL}, fallback):`, fallbackQuery)
        try {
            snippets.push(...await search(fallbackQuery, false))
        } catch (error) {
            console.warn(`Search failed for query "${fallbackQuery}":`, error)
        }
    }

    // The search that was kept back: if the model searched the web but never
    // the Kenyan sites, run its first web query again on them. Room is left
    // for the word "Kenya" so that adding it never pushes the query over
    // Tavily's length limit.
    const firstWebSearch = searchesRun.find((s) => !s.kenyan)
    if (firstWebSearch && !searchesRun.some((s) => s.kenyan)) {
        const kenyanQuery = `${firstWebSearch.query.slice(0, MAX_SEARCH_QUERY_LENGTH - " Kenya".length)} Kenya`
        console.log(`Search (${KENYAN_SEARCH_TOOL}):`, kenyanQuery)
        try {
            snippets.push(...await search(kenyanQuery, true))
        } catch (error) {
            console.warn(`Search failed for query "${kenyanQuery}":`, error)
        }
    }

    // Different searches often surface the same source page; collapse those
    // before handing the context to the author.
    return dedupeSnippets(snippets)
}

// ---------------------------------------------------------------------------
// The CHAT graph: what the website uses.
// ---------------------------------------------------------------------------

/**
 * One line of the conversation: who spoke and what they said.
 * "user" is the visitor, "assistant" is the agent. These are the same role
 * names the model itself expects, so a ChatTurn can be sent to it as-is.
 */
type ChatTurn = {
    role: "user" | "assistant"
    content: string
}

//define the memory schema for the chat graph

const ChatState = Annotation.Root({
    question: Annotation<string>(), //the message the visitor has just sent
    answer: Annotation<string>(), //the agent's reply to that message
    researchData: Annotation<string[]>(), //saved by the chat Researcher, read by the chat Author

    // The whole conversation so far. The fields above are simply
    // overwritten when a node returns a new value, but for the history we
    // want to ADD to what is already there. A "reducer" tells LangGraph how
    // to combine the saved value with a node's update: here, by appending
    // the new turns to the end of the existing list.
    messages: Annotation<ChatTurn[]>({
        reducer: (existing, update) => existing.concat(update),
        default: () => [], //a brand-new conversation starts with no history
    }),
})

// How many earlier turns are sent to the model with each new question. A
// model can only read a limited amount of text per request, and every extra
// turn makes the request slower, so we send only the most recent ones.
// 10 turns = the last 5 questions and their 5 answers.
const HISTORY_LIMIT = 10

// The most searches the researcher will run for one question, including the
// Kenyan one. Every search is one Tavily request, so this is also the most a
// message can cost.
const MAX_QUERIES = 3

/**
 * LangGraph node that gathers research context for the visitor's question.
 * This is the chat version of `researcherNode` in report.ts. It hands the
 * question to the researcher (`research`), which decides what to search for.
 * Unlike the report, the chat gives it a single round: it plans every search
 * at once and does not read the results and search again, which saves one
 * slow model call per question.
 *
 * The difference is in the instructions. Every question is different, so
 * the researcher works out the angles for this one (a drug-interaction angle
 * and a food angle for "can a patient on warfarin eat sukuma wiki?"). It
 * also sees the recent conversation, so it can turn a follow-up like "what
 * about spinach?" into a query that makes sense alone ("spinach and
 * warfarin vitamin K").
 *
 * It is also where off-topic questions are caught. If the question is not
 * about nutrition there is nothing worth searching for, so the researcher
 * is told not to search at all. That saves searches we would otherwise pay
 * for and then throw away. The same goes for messages that need no new
 * facts, such as "thanks" or "make that shorter".
 *
 * @param state - Current graph state; reads `state.question` and
 *   `state.messages`.
 * @returns A partial state update setting `researchData` to the deduplicated
 *   list of search-result snippets. LangGraph merges this into the full
 *   state automatically.
 */
async function chatResearcherNode(state: typeof ChatState.State) {
    console.log("--- RUNNING RESEARCHER PHASE ---")

    const instructions = `You are the researcher for a clinical nutrition assistant. You find the evidence; someone else writes the answer. You never answer questions yourself.

First, check the user's latest message (do this before anything else):
- The assistant only handles nutrition, food, diet, and how medicines interact with food.
- If the message is about anything else (sport, news, politics, coding, general knowledge and so on), do not call a tool. Reply with only the word NONE.
- If the message needs no new facts (a greeting, thanks, or a request to shorten or reword the previous answer), also do not call a tool. Reply with only the word NONE.

Otherwise, find the evidence needed to answer it. You have two search tools: ${WEB_SEARCH_TOOL} (the whole web) and ${KENYAN_SEARCH_TOOL} (Kenyan government and research sites only). You can run up to ${MAX_QUERIES - 1} searches in total.

Angles to consider (use only the ones that apply to this question):
- the patient group or condition (elderly, HIV, diabetes, cancer, infants and neonates, post-operative)
- the medicine involved and its drug-nutrient interactions
- renal or hepatic dietary restrictions
- suitable foods or meals, preferably Kenyan (use ${KENYAN_SEARCH_TOOL} for these)

How to work:
- You get ONE turn: call every search you need in this single reply, all at once. You will not see the results or get another turn, so do not hold any search back for later.
- A simple question may need only one search. When the question names a food, especially a Kenyan food, also call ${KENYAN_SEARCH_TOOL} in the same reply.
- Each query must cover a DIFFERENT angle. Do not search for the same thing in different words.
- Each query must be specific: name the exact food, medicine and condition asked about, so the results cover them and not just something related.
- Each query must make sense alone. Replace words like "they", "it" or "that" with what they refer to in the conversation.`

    // The recent conversation, then the new question last.
    const conversation: BaseMessageLike[] = [
        ...state.messages.slice(-HISTORY_LIMIT),
        { role: "user", content: state.question },
    ]

    // An empty list means the researcher decided no search was needed. We
    // still return it (rather than nothing) because the state is saved
    // between messages: without this, the author would be handed the
    // research from the PREVIOUS question.
    const researchData = await research(
        instructions,
        conversation,
        MAX_QUERIES,
        state.question,
        // One round: the model plans every search at once. A second round,
        // to read the results, cost another 20 to 30 seconds per question
        // and nearly always ended with the model saying it had enough.
        1
    )

    return { researchData }
}

/**
 * LangGraph node that turns gathered research into the answer. This is the
 * chat version of `authorNode` in report.ts.
 *
 * Reads the deduplicated snippets left by `chatResearcherNode` in
 * `state.researchData`, joins them into a single context block, and asks the
 * model to answer the visitor's question grounded in that context. Unlike
 * the report author it writes a short, direct answer, and it also reads the
 * recent conversation so it understands follow-up questions.
 *
 * @param state - Current graph state; reads `state.question`,
 *   `state.researchData` and `state.messages`.
 * @returns A partial state update setting `answer` to the model's reply and
 *   adding the question and reply to `messages`.
 */
async function chatAuthorNode(state: typeof ChatState.State) {
    console.log("--- RUNNING AUTHOR PHASE ---")

    // 1. Combine the gathered snippets into a solid text block
    const searchResults = state.researchData.join("\n\n") || "(no search results were found)"

    // Whether the Kenyan search found anything. We work this out here and
    // tell the model outright, instead of leaving it to notice the labels,
    // so it cannot overlook that an answer has no Kenyan source behind it.
    const hasKenyanSource = state.researchData.some((snippet) => snippet.startsWith(KENYAN_LABEL))

    // 2a. The "system" message: instructions and background the model should
    // follow for the whole reply. The visitor never sees this text.
    const systemPrompt = `You are a careful clinical nutrition assistant. You help with nutrition for immunocompromised patients (elderly, HIV, diabetes, cancer, infants and neonates, post-operative, and patients on medicines such as Revlimid, Velcade and dexamethasone) and with drug-nutrient interactions.

Scope (check this first, before anything else):
- You only answer questions about nutrition, food, diet, and how medicines interact with food.
- If the question is about anything else (sport, news, politics, coding, general knowledge and so on), reply with one sentence saying you can only help with nutrition questions, and nothing more. Do this even if the search results below contain the answer.

How to answer:
- Answer the specific question the user asked, directly and first. Do not write a report or cover topics they did not ask about.
- Keep it short: a few sentences or a short bullet list. Give more detail only if the user asks for it.
- Use Markdown. Use a table only when the user asks for a meal plan or a comparison. Do not use emojis.
- Base your answer on the search results below.
- When you suggest foods or meals, prefer Kenyan foods that are affordable and easy to find.
- If the answer depends on something you were not told (for example the patient's medicines, kidney or liver function, age or allergies), give the general answer and then ask for the one detail that matters most.
- If the message needs no new facts (a greeting, thanks, or a request to shorten or reword your previous answer), reply to it using the conversation. The rules about gaps and sources below do not apply to it.

Gaps in the evidence (the user is a patient and must be able to see these):
- Before you write, compare the search results with the question. Check whether they cover the exact food and the exact medicine or condition the user asked about.
- If they cover it, answer normally and add nothing about gaps.
- If they only cover something related (for example kale or "leafy greens" when the user asked about sukuma wiki or managu, or a medicine class instead of the named medicine), you may answer from that, but you must say so.
- If they do not cover the question at all, say that you found no reliable source for it and stop there. Do not fill the gap from your own memory. Tell the user to ask their doctor, pharmacist or dietitian.
- Results that start with "${KENYAN_LABEL}" come from Kenyan government or research bodies. ${hasKenyanSource ? "Prefer them when they are relevant to the question. If none of them is relevant, treat this answer as having no Kenyan source." : "No Kenyan source was found for this question."}
- If the question involves a Kenyan food or a meal plan and the answer has no Kenyan source behind it, say that it is based on international sources and may not match how the food is grown, prepared or served in Kenya.
- Put every gap in one short paragraph that starts with "**What I could not confirm:**", placed after the answer and before the Sources list. Name the specific thing that is missing.
- When there is no gap, do not write that paragraph or its heading at all. Never write it only to say that nothing is missing.

Safety:
- Safety is key. Mention relevant drug-nutrient interactions (grapefruit family, vitamin K consistency, tyramine, potassium, sodium, St John's Wort, calcium/iron timing, CYP450 inducers and inhibitors) and renal or hepatic restrictions when they apply to the question.
- You give general information; you are not treating a patient. When the question is about a specific person's diet or medication, end by reminding the user to confirm with their doctor, pharmacist or dietitian before changing anything.

Sources:
- Each search result below starts with its title (after the "${KENYAN_LABEL}" line, if it has one), then a "Link:" line with its web address. Never copy "${KENYAN_LABEL}" into your answer.
- If you used the search results, end with a "Sources:" list of the ones you used. Write every source as a Markdown link made from its title and its link, exactly like this: [Title](https://link). A source without its link is not allowed.
- Do not put source names or links inside the answer itself; they belong only in the Sources list.
- Only use links that appear in the search results below. Never invent a link. If you did not use any, leave the Sources list out completely.

SEARCH RESULTS FOR THIS QUESTION:
${searchResults}`

    // 2b. The recent conversation, so the model knows what "they", "it" or
    // "that" refer to. slice(-HISTORY_LIMIT) keeps only the last few turns.
    const recentTurns = state.messages.slice(-HISTORY_LIMIT)

    // 2c. Put it together in the order the model reads it: instructions,
    // then the earlier back-and-forth, then the new question last.
    const response = await model.invoke([
        { role: "system", content: systemPrompt },
        ...recentTurns,
        { role: "user", content: state.question },
    ])
    const answer = response.content as string

    // 3. Save the reply and append this exchange to the history, so the next
    // question can see it. Because `messages` has a reducer, these two turns
    // are added to the end of the history instead of replacing it.
    return {
        answer,
        messages: [
            { role: "user" as const, content: state.question },
            { role: "assistant" as const, content: answer },
        ],
    }
}

// The chat graph follows the same architecture as the report graph: the
// ReAct researcher gathers the context, then the author writes from it.
//
//   START -> researcher -> author -> END
const chatWorkflow = new StateGraph(ChatState)
    .addNode("researcher", chatResearcherNode)
    .addNode("author", chatAuthorNode)
    .addEdge("__start__", "researcher")
    .addEdge("researcher", "author")
    .addEdge("author", END);

// The checkpointer is the agent's memory between messages. After each node
// finishes, it saves a copy of the state (including `messages`). The
// next time the graph runs for the same conversation, it loads that copy
// first, which is how the agent "remembers" the earlier questions.
//
// MemorySaver keeps those copies in this server's RAM. That is simple and
// needs no database, but it means every conversation is forgotten when the
// server restarts (on Render's free plan, that includes when it goes to
// sleep after about 15 minutes without visitors).
const checkpointer = new MemorySaver()

const chatApp = chatWorkflow.compile({ checkpointer });

// How long a conversation may sit unused before it is forgotten, and how
// often we check. Without this, saved conversations would pile up in RAM for
// as long as the server stays awake.
const CONVERSATION_IDLE_LIMIT_MS = 60 * 60 * 1000 //1 hour
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000 //10 minutes

// Remembers when each conversation was last used: thread ID -> time in
// milliseconds. Used only by the cleanup below.
const lastActive = new Map<string, number>()

// Every 10 minutes, delete the saved state of conversations nobody has
// touched for an hour.
// .unref() tells Node this timer alone should not keep the program running,
// so `npm run report` (which imports this file) can still exit when the
// report is finished.
setInterval(async () => {
    const cutoff = Date.now() - CONVERSATION_IDLE_LIMIT_MS
    for (const [threadId, lastUsed] of lastActive) {
        if (lastUsed < cutoff) {
            await checkpointer.deleteThread(threadId)
            lastActive.delete(threadId)
        }
    }
}, CLEANUP_INTERVAL_MS).unref()

/**
 * Sends one message into a conversation and returns the agent's reply. This
 * is the single entry point the web server calls, so the server never needs
 * to know about nodes, state or LangGraph.
 *
 * The thread ID is what ties messages together. Each visitor's browser makes
 * up a random ID and sends it with every message; the checkpointer uses it
 * to load and save the right conversation. Two visitors have different IDs,
 * so they never see each other's history.
 *
 * @param threadId - The ID of the conversation this message belongs to.
 * @param message - What the visitor typed.
 * @returns The agent's reply as a Markdown string.
 */
export async function sendMessage(threadId: string, message: string): Promise<string> {
    // Passing thread_id here is what makes the checkpointer load this
    // conversation's saved state before the graph runs, and save it after.
    const config = { configurable: { thread_id: threadId } }

    // We only pass in the new question. The history is not passed in: it is
    // already saved under this thread ID and is loaded automatically.
    const state = await chatApp.invoke({ question: message }, config)
    lastActive.set(threadId, Date.now())

    return state.answer
}
