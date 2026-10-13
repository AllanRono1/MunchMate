import { StateGraph, Annotation, END, MemorySaver } from "@langchain/langgraph"
import { ChatOpenAI } from "@langchain/openai"
import { tavily } from "@tavily/core"
import * as dotenv from "dotenv"
import { writeFile } from "node:fs/promises"
import { marked } from "marked"

//used to read content of .env file and loads its key-value pair into the
//  process.env so that the rest of the code can read them
dotenv.config()

if (!process.env.TAVILY_API_KEY) {
    throw new Error("TAVILY_API_KEY is not set")
}

const tavilyClient = tavily({ apiKey: process.env.TAVILY_API_KEY })

// Connect to the OpenRouter Nemotron endpoint. The ":free" at the end of the
// model name is what selects the free version; without it OpenRouter charges
// for each request. Created once here so that both graphs share the same
// model.
const model = new ChatOpenAI({
    configuration: { baseURL: "https://openrouter.ai/api/v1" },
    modelName: "nvidia/nemotron-3-super-120b-a12b:free",
    apiKey: process.env.OPENROUTER_API_KEY
})

// This file holds two separate graphs:
//
//   1. The REPORT graph (researcher -> author). It writes one long report
//      and is only used from the terminal, with `npm run report`.
//   2. The CHAT graph. It follows the same researcher -> author
//      architecture, but answers one specific question at a time and
//      remembers the conversation. This is what the website uses.
//
// Each graph has its own state, because they need to remember different
// things. Both use dedupeSnippets, so that comes first.

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
        const key = snippet.trim().toLowerCase().replace(/\s+/g, " ");
        if (key && !seen.has(key)) {
            seen.add(key);
            deduped.push(snippet.trim());
        }
    }

    return deduped;
}

// ---------------------------------------------------------------------------
// The REPORT graph: used from the terminal with `npm run report`.
// ---------------------------------------------------------------------------

//define the memory schema for the report graph

const AgentState = Annotation.Root({
    topic: Annotation<string>(), //input provided by the user
    reportStructure: Annotation<string>(), //input provided by the user: the layout the report must follow
    researchData: Annotation<string[]>(), //saved by Researcher, read by Author
    report: Annotation<string>(), //saved by the author as the final output
})

/**
 * LangGraph node that gathers research context for the report topic.
 *
 * Instead of a single broad Tavily search, this fans out several targeted
 * queries (one per patient category / interaction concern) concurrently via
 * `Promise.allSettled`, then merges and deduplicates the results into the
 * shared research context that `authorNode` reads.
 *
 * @param state - Current graph state; only `state.topic` is read here.
 * @returns A partial state update setting `researchData` to the deduplicated
 *   list of search-result snippets. LangGraph merges this into the full
 *   state automatically.
 */
async function researcherNode(state: typeof AgentState.State) {
    console.log("--- RUNNING RESEARCHER PHASE ---")

    // One query per angle we want covered, instead of one generic query.
    // Keeping these as separate strings (rather than one combined query)
    // is what lets each be searched independently and in parallel below.
    const queries = [
        `${state.topic}: nutrition considerations for elderly patients`,
        `${state.topic}: nutrition considerations for Revlimid (lenalidomide), Velcade (bortezomib), and dexamethasone patients`,
        `${state.topic}: nutrition considerations for HIV patients`,
        `${state.topic}: nutrition considerations for diabetes patients`,
        `${state.topic}: nutrition considerations for cancer patients`,
        `${state.topic}: nutrition considerations for infants and neonates`,
        `${state.topic}: nutrition considerations for post-operative patients`,
        `${state.topic}: renal and hepatic dietary restrictions`,
        `${state.topic}: drug-nutrient interactions (grapefruit, vitamin K, tyramine, CYP450 inducers/inhibitors)`,
    ]

    // Fire all searches concurrently (JS/TS equivalent of Python's
    // asyncio.gather). `allSettled` (rather than `Promise.all`) is used
    // deliberately: if one query's search fails, we still get results from
    // the rest instead of the whole batch throwing.
    const settledResults = await Promise.allSettled(
        queries.map((query) => (tavilyClient.search(query, {maxResults: 3})))
    )

    // Flatten each query's results into one list of content strings, logging
    // (but not throwing on) any query that failed.
    const rawSnippets: string[] = settledResults.flatMap((result, i) => {
        if(result.status === 'fulfilled') {
            return result.value.results?.map((res) => res.content) || []
        }
        console.warn(`Search failed for query"${queries[i]}":`, result.reason)
        return []
    })

    // Overlapping queries can surface the same source twice; collapse those
    // before handing the context to the author.
    const contextStrings = dedupeSnippets(rawSnippets);

    return { researchData: contextStrings }
}

/**
 * LangGraph node that turns gathered research into the final report.
 *
 * Reads the deduplicated snippets left by `researcherNode` in
 * `state.researchData`, joins them into a single context block, and asks
 * the OpenRouter-hosted Nemotron model to write a Markdown report grounded
 * in that context.
 *
 * @param state - Current graph state; reads `state.topic`,
 *   `state.reportStructure` and `state.researchData`.
 * @returns A partial state update setting `report` to the model's
 *   generated report text.
 */
async function authorNode(state: typeof AgentState.State) {
    console.log("--- RUNNING AUTHOR PHASE ---")

    // Combine the gathered snippets into a solid text block
    const context = state.researchData.join("\n\n")

    const prompt = `You are an elite research assistant. 
Using the real-time context below, write a professional report about: ${state.topic}.
Use clear Markdown headers, bullet points, and an objective tone.
.
 
Topic for this section:
${state.topic}
 
When generating ${state.topic} search queries, ensure they:
1. Suggest personalized meal plan for immunocomprised patients and they should be Kenyan meals
2. Cover different aspects of the topic (e.g., elderly patients, RVD patients, diabetespatients, cancer patients, 
immunosuppressed patients, infants and neonates, post operative patients, 
all kinds of disease states. Consider age, gender, medical history and allergies. 
Consider current medications and their drug-drug interactions and side effects
utilise knowledge on the drug- nutrient interactions like CYP450 drug inducers and inhibitors.
Safety is key.Account for renal/hepatic function, full med and supplement list, swallowing ability, labs/weight trend, food access and cost. 
Top interaction categories to encode: grapefruit family,vitamin K consistency,tyramine,patassium,sodium,St John's Wort, calcium/iron timing)
3. Include specific technical terms related to the topic
4. Look for comparisons or differentiators from similar approaches
5. Search for both official documentation and practical implementation examples
 
Your queries should be:
- Specific enough to avoid generic results
- Diverse enough to cover all aspects of the section plan
- Focused on authoritative sources (documentation, technical blogs, academic papers)
- Outline sources

    REPORT STRUCTURE (follow this layout exactly, section by section):
    ${state.reportStructure}

    CONTEXT:
    ${context}

    REPORT:`;

    const response = await model.invoke(prompt);

    // Update the final state entry with the generated text
    return { report: response.content as string };
}

const workflow = new StateGraph(AgentState)
    // 1. Mount the components as executable blocks
    .addNode("researcher", researcherNode)
    .addNode("author", authorNode)

    // 2. Map out the execution path links
    .addEdge("__start__", "researcher")
    .addEdge("researcher", "author")
    .addEdge("author", END);

// 3. Compile the structural map into a runnable agent application
const reportApp = workflow.compile();

// The layout a report follows when the caller doesn't supply its own
const DEFAULT_REPORT_STRUCTURE = `This article should be a practical clinical reference, structured as:
1. Introduction - why nutrition matters for immunocompromised patients (1-2 paragraphs)
2. One section per patient group (elderly, RVD/HIV, diabetes, cancer, infants and neonates, post-operative), each with key nutritional needs and foods to favour or avoid
3. Renal and hepatic dietary restrictions
4. Drug-nutrient interactions - a Markdown table of drug/class, food or nutrient, effect, and advice
5. Sample Kenyan meal plan - a Markdown table covering breakfast, lunch, supper and snacks
6. Conclusion - key safety takeaways as bullet points
7. Sources`

/**
 * Runs the report graph (researcher -> author) for one topic and returns the
 * finished report. Only used when this file is run from the terminal.
 *
 * @param topic - What the report should be about.
 * @param reportStructure - The layout the report must follow.
 * @returns The generated report as a Markdown string.
 */
async function generateReport(
    topic: string,
    reportStructure: string = DEFAULT_REPORT_STRUCTURE
): Promise<string> {
    const state = await reportApp.invoke({ topic, reportStructure })
    return state.report
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

// Tavily rejects search queries longer than 400 characters.
const MAX_SEARCH_QUERY_LENGTH = 400

// The most angles the researcher will search for one question. Every angle
// is one Tavily search, so this is also the most searches a message can cost.
const MAX_QUERIES = 3

/**
 * Works out which searches to run for the visitor's question: one query per
 * angle we want covered, instead of one generic query.
 *
 * In the report graph the angles are a fixed list written by hand. Here they
 * have to be DYNAMIC, because every question is different: "can a patient on
 * warfarin eat sukuma wiki?" has a drug-interaction angle and a food angle,
 * while "what should an elderly diabetic eat after surgery?" has three
 * patient-group angles. So we ask the model to read the question and write
 * the queries itself.
 *
 * The model also sees the recent conversation, so it can turn a follow-up
 * like "what about spinach?" into a query that makes sense alone
 * ("spinach and warfarin vitamin K").
 *
 * It is also where off-topic questions are caught. If the question is not
 * about nutrition there is nothing worth searching for, so the model is told
 * to reply NONE and this function returns an empty list. That saves a search
 * we would otherwise pay for and then throw away.
 *
 * @param question - The message the visitor has just sent.
 * @param recentTurns - The last few turns of the conversation, for context.
 * @returns Up to MAX_QUERIES search queries, each a separate string. An
 *   empty list means the question is off-topic and needs no search.
 */
async function planQueries(question: string, recentTurns: ChatTurn[]): Promise<string[]> {
    const plannerPrompt = `You write web search queries for a clinical nutrition assistant. You never answer questions yourself.

First, check the topic (do this before anything else):
- The assistant only handles nutrition, food, diet, and how medicines interact with food.
- If the user's latest question is about anything else (sport, news, politics, coding, general knowledge and so on), reply with only the single word NONE and stop. Do not write queries, code or an answer.

Otherwise, read the conversation and the user's latest question, then write the search queries needed to answer it: one query per angle that should be covered, up to ${MAX_QUERIES}.

Angles to consider (use only the ones that apply to this question):
- the patient group or condition (elderly, HIV, diabetes, cancer, infants and neonates, post-operative)
- the medicine involved and its drug-nutrient interactions
- renal or hepatic dietary restrictions
- suitable foods or meals, preferably Kenyan

Rules:
- Each query must cover a DIFFERENT angle. Do not write the same query in different words.
- Each query must make sense alone. Replace words like "they", "it" or "that" with what they refer to in the conversation.
- A simple question may need only one query.
- Never answer the question yourself. Your only job is to write search queries.
- Write one query per line. No numbering, no bullet points, no quotation marks, no other text.`

    try {
        const response = await model.invoke([
            { role: "system", content: plannerPrompt },
            ...recentTurns,
            { role: "user", content: question },
        ])
        const reply = (response.content as string).trim()

        // NONE is the model telling us the question is off-topic. An empty
        // list tells the researcher to skip the search. The pattern allows
        // for small variations such as "none" or "NONE.".
        if (/^none\.?$/i.test(reply)) {
            return []
        }

        // Otherwise the model replies with one query per line. Split the reply into
        // lines, strip any numbering or bullets it added anyway, drop empty
        // lines, and keep at most MAX_QUERIES.
        const queries = reply
            .split("\n")
            .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").replace(/^["']|["']$/g, "").trim())
            .filter((line) => line.length > 0)
            .slice(0, MAX_QUERIES)
            .map((query) => query.slice(0, MAX_SEARCH_QUERY_LENGTH))

        if (queries.length > 0) {
            return queries
        }
    } catch (error) {
        console.warn("Could not plan search queries:", error)
    }

    // If the model failed or returned nothing usable, fall back to searching
    // for the question exactly as it was typed, so the visitor still gets
    // an answer.
    return [question.slice(0, MAX_SEARCH_QUERY_LENGTH)]
}

/**
 * LangGraph node that gathers research context for the visitor's question.
 * This is the chat version of `researcherNode` above and works the same way:
 *
 * Instead of a single broad Tavily search, it fans out several targeted
 * queries (one per angle of the question) concurrently via
 * `Promise.allSettled`, then merges and deduplicates the results into the
 * shared research context that `chatAuthorNode` reads.
 *
 * The one difference is where the queries come from: here they are written
 * for each question by `planQueries`, instead of being a fixed list.
 *
 * @param state - Current graph state; reads `state.question` and
 *   `state.messages`.
 * @returns A partial state update setting `researchData` to the deduplicated
 *   list of search-result snippets. LangGraph merges this into the full
 *   state automatically.
 */
async function chatResearcherNode(state: typeof ChatState.State) {
    console.log("--- RUNNING RESEARCHER PHASE ---")

    // One query per angle we want covered, instead of one generic query.
    // Keeping these as separate strings (rather than one combined query)
    // is what lets each be searched independently and in parallel below.
    const queries = await planQueries(state.question, state.messages.slice(-HISTORY_LIMIT))
    console.log("Search queries:", queries)

    // No queries means the question is off-topic, so there is nothing to
    // search for. We still return an empty researchData (rather than
    // nothing) because the state is saved between messages: without this,
    // the author would be handed the research from the PREVIOUS question.
    if (queries.length === 0) {
        return { researchData: [] }
    }

    // Fire all searches concurrently. `allSettled` (rather than
    // `Promise.all`) is used deliberately: if one query's search fails, we
    // still get results from the rest instead of the whole batch throwing.
    const settledResults = await Promise.allSettled(
        queries.map((query) => (tavilyClient.search(query, {maxResults: 3})))
    )

    // Flatten each query's results into one list of snippets, logging (but
    // not throwing on) any query that failed. Each snippet keeps its title
    // and link in front of its text, so the author can tell the visitor
    // where a fact came from.
    const rawSnippets: string[] = settledResults.flatMap((result, i) => {
        if(result.status === 'fulfilled') {
            return result.value.results?.map((res) => `${res.title}\nLink: ${res.url}\n${res.content.trim()}`) || []
        }
        console.warn(`Search failed for query"${queries[i]}":`, result.reason)
        return []
    })

    // Different angles of the same question often surface the same source
    // page; collapse those before handing the context to the author.
    const contextStrings = dedupeSnippets(rawSnippets);

    return { researchData: contextStrings }
}

/**
 * LangGraph node that turns gathered research into the answer. This is the
 * chat version of `authorNode` above.
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
- Base your answer on the search results below. If they do not cover the question, say what is uncertain instead of guessing.
- When you suggest foods or meals, prefer Kenyan foods that are affordable and easy to find.
- If the answer depends on something you were not told (for example the patient's medicines, kidney or liver function, age or allergies), give the general answer and then ask for the one detail that matters most.

Safety:
- Safety is key. Mention relevant drug-nutrient interactions (grapefruit family, vitamin K consistency, tyramine, potassium, sodium, St John's Wort, calcium/iron timing, CYP450 inducers and inhibitors) and renal or hepatic restrictions when they apply to the question.
- You give general information; you are not treating a patient. When the question is about a specific person's diet or medication, end by reminding the user to confirm with their doctor, pharmacist or dietitian before changing anything.

Sources:
- Each search result below starts with its title, then a "Link:" line with its web address.
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
// researcher gathers the context, then the author writes from it.
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
// so `npm run report` can still exit when the report is finished.
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

// ---------------------------------------------------------------------------
// Running this file from the terminal: writes the one-off report.
// ---------------------------------------------------------------------------

async function runAgent() {
    const report = await generateReport("Nutrition for immuno compromised patients")

    console.log("\n====== GENERATED REPORT ======\n");
    console.log(report);

    // A terminal can't render Markdown the way a notebook's Markdown() does,
    // so also save the report to a file that can be opened in a previewer.
    await writeFile("report.md", report);
    console.log("\nReport saved to report.md");

    // Convert the Markdown to HTML so it can be opened in a browser
    const html = `<!doctype html>
    <meta charset="utf-8">
    <title>Report</title>
    <body style="max-width: 850px; margin: 2rem auto; font-family: sans-serif">
    ${await marked.parse(report)}
    </body>`
    await writeFile("report.html", html)
    console.log("Report saved to report.html")
}

// Only run the one-off report when this file is started directly
// (npx tsx agent.ts). When server.ts imports it, nothing runs until a
// visitor asks a question.
if (require.main === module) {
    runAgent();
}
