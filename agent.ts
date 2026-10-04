import{StateGraph, Annotation, END, MemorySaver} from "@langchain/langgraph"
import {ChatOpenAI} from "@langchain/openai"
import { tavily } from "@tavily/core"
import * as dotenv from "dotenv"
import { writeFile } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { marked } from "marked"

//used to read content of .env file and loads its key-value pair into the
//  process.env so that the rest of the code can read them
dotenv.config()

if (!process.env.TAVILY_API_KEY) {
    throw new Error("TAVILY_API_KEY is not set")
}

const tavilyClient = tavily({ apiKey: process.env.TAVILY_API_KEY })

// Connect to the free OpenRouter Nemotron endpoint. Created once here so
// both the author node (full report) and the chat node (follow-up answers)
// share the same model.
const model = new ChatOpenAI({
    configuration: { baseURL: "https://openrouter.ai/api/v1" },
    modelName: "nvidia/nemotron-3-nano-30b-a3b",
    apiKey: process.env.OPENROUTER_API_KEY
})

/**
 * One line of the conversation: who spoke and what they said.
 * "user" is the visitor, "assistant" is the agent. These are the same role
 * names the model itself expects, so a ChatTurn can be sent to it as-is.
 */
type ChatTurn = {
    role: "user" | "assistant"
    content: string
}

//define the memory schema

const AgentState = Annotation.Root({
    topic: Annotation<string>(), //the first question of the conversation; the report is written about this
    reportStructure: Annotation<string>(), //input provided by the user: the layout the report must follow
    researchData: Annotation<string[]>(), //saved by Researcher, read by Author
    report: Annotation<string>(), //saved by the author; later read by the chat node as background

    question: Annotation<string>(), //the message the visitor has just sent
    answer: Annotation<string>(), //the agent's reply to that message (a report or a short chat answer)

    // The whole conversation so far. Every other field above is simply
    // overwritten when a node returns a new value, but for the history we
    // want to ADD to what is already there. A "reducer" tells LangGraph how
    // to combine the saved value with a node's update: here, by appending
    // the new turns to the end of the existing list.
    messages: Annotation<ChatTurn[]>({
        reducer: (existing, update) => existing.concat(update),
        default: () => [], //a brand-new conversation starts with no history
    }),
})

// example of JSON schema converted by an AI framework:
// {
//   "type": "function",
//   "function": {
//     "name": "getStockPrice",
//     "description": "Fetches the current stock price for a given ticker symbol.",
//     "parameters": {
//       "type": "object",
//       "properties": {
//         "ticker": {
//           "type": "string",
//           "description": "The stock ticker symbol (e.g., AAPL, GOOG)."
//         }
//       },
//       "required": ["ticker"]
//     }
//   }
// }


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

// async function researcherNode(state: typeof AgentState.State) {
//     console.log("--- RUNNING RESEARCHER PHASE ---")

//     const searchData = await tavilyClient.search(
//         `detailed technical overview of ${state.topic}`,
//         { maxResults: 3 }
//     )

//     const contextStrings: string[] = searchData.results?.map((res) => res.content) || [];

//     return { researchData: contextStrings }
// }

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
    // const rawSnippets: string[] = settledResults.flatMap((result, i) => {
    //     if (result.status === "fulfilled") {
    //         return result.value.results?.map((res) => res.content) || [];
    //     }
    //     console.warn(`Search failed for query "${queries[i]}":`, result.reason);
    //     return [];
    // });

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
 * @returns A partial state update setting `report` and `answer` to the
 *   model's generated report text, and adding the first exchange (the
 *   visitor's question and this report) to `messages`.
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
    const report = response.content as string

    return {
        // Kept for the rest of the conversation: the chat node reads it as
        // background when answering follow-up questions.
        report,
        // What gets sent back to the visitor for this message.
        answer: report,
        // Record the first exchange. Because `messages` has a reducer, these
        // two turns are appended to the history instead of replacing it.
        messages: [
            { role: "user" as const, content: state.question },
            { role: "assistant" as const, content: report },
        ],
    };
}

// How many earlier turns the chat node sends to the model with each
// follow-up. A model can only read a limited amount of text per request, and
// every extra turn makes the request slower, so we send only the most recent
// ones. 10 turns = the last 5 questions and their 5 answers.
const HISTORY_LIMIT = 10

// Tavily rejects search queries longer than 400 characters.
const MAX_SEARCH_QUERY_LENGTH = 400

/**
 * LangGraph node that answers a follow-up question in an existing
 * conversation.
 *
 * The first message of a conversation goes through researcher -> author and
 * produces a full report. Every message after that comes here instead, so a
 * short question like "can they eat mangoes?" gets a short answer rather
 * than another nine searches and another full report.
 *
 * It does three things:
 *   1. Runs ONE web search for the follow-up question, in case it asks about
 *      something the original research did not cover.
 *   2. Builds a request for the model out of: instructions, the report
 *      written earlier, the fresh search results, the recent conversation,
 *      and finally the new question.
 *   3. Saves the model's reply and adds the exchange to the history.
 *
 * @param state - Current graph state; reads `state.question`, `state.topic`,
 *   `state.report` and `state.messages`.
 * @returns A partial state update setting `answer` to the model's reply and
 *   adding the question and reply to `messages`.
 */
async function chatNode(state: typeof AgentState.State) {
    console.log("--- RUNNING CHAT PHASE ---")

    // 1. Search for the follow-up. The original topic is put in front of the
    // question because follow-ups often make no sense alone: "can they eat
    // mangoes?" only becomes searchable once we say who "they" are.
    const searchQuery = `${state.topic}: ${state.question}`.slice(0, MAX_SEARCH_QUERY_LENGTH)

    let searchSnippets: string[] = []
    try {
        const searchData = await tavilyClient.search(searchQuery, { maxResults: 3 })
        searchSnippets = dedupeSnippets(searchData.results?.map((res) => res.content) || [])
    } catch (error) {
        // A failed search should not end the conversation. The model can
        // still answer from the report and the history, so log and carry on.
        console.warn(`Search failed for follow-up "${state.question}":`, error)
    }

    // 2a. The "system" message: instructions and background the model should
    // follow for the whole reply. The visitor never sees this text.
    const systemPrompt = `You are a careful clinical nutrition assistant continuing a conversation about: ${state.topic}.

Earlier in this conversation you wrote the report below. The user is now asking a follow-up question.

How to answer:
- Answer the follow-up directly and briefly: a few short paragraphs or bullet points, not another full report.
- Use Markdown. Use a table only if the user asks to compare things.
- Base your answer on the report and the new search results below. If they do not cover the question, say so plainly instead of guessing.
- When you suggest foods or meals, prefer Kenyan foods that are affordable and easy to find.
- Safety is key. Point out relevant drug-nutrient interactions and renal or hepatic restrictions.
- You are giving general information, not treating a patient. When the question is about a specific person's diet or medication, remind the user to confirm with their doctor, pharmacist or dietitian before changing anything.

REPORT YOU WROTE EARLIER:
${state.report}

NEW SEARCH RESULTS FOR THIS QUESTION:
${searchSnippets.join("\n\n") || "(no search results were found)"}`

    // 2b. The recent conversation. The first two saved turns are the opening
    // question and the full report; both are already in the system message
    // above (as the topic and the report), so slice(2) skips them to avoid
    // sending the long report twice. slice(-HISTORY_LIMIT) then keeps only
    // the most recent turns of whatever is left.
    const recentTurns = state.messages.slice(2).slice(-HISTORY_LIMIT)

    // 2c. Put it together in the order the model reads it: instructions,
    // then the earlier back-and-forth, then the new question last.
    const response = await model.invoke([
        { role: "system", content: systemPrompt },
        ...recentTurns,
        { role: "user", content: state.question },
    ])
    const answer = response.content as string

    // 3. Save the reply and append this exchange to the history, so the next
    // follow-up can see it.
    return {
        answer,
        messages: [
            { role: "user" as const, content: state.question },
            { role: "assistant" as const, content: answer },
        ],
    }
}

/**
 * Decides which node handles an incoming message. LangGraph calls this at
 * the very start of every run and goes to whichever node name it returns.
 *
 * The test is whether a report has already been written in this
 * conversation. If not, this is the first message, so do the full research.
 * If so, this is a follow-up, so go straight to the chat node.
 *
 * @param state - Current graph state; only `state.report` is read here.
 * @returns The name of the node to run next.
 */
function routeMessage(state: typeof AgentState.State) {
    return state.report ? "chat" : "researcher"
}

    const workflow = new StateGraph(AgentState)
  // 1. Mount the components as executable blocks
  .addNode("researcher", researcherNode)
  .addNode("author", authorNode)
  .addNode("chat", chatNode)

  // 2. Map out the execution path links
  // A conditional edge is a fork in the road: instead of always going to the
  // same node, LangGraph calls routeMessage and follows its answer. The
  // array lists every node it is allowed to choose.
  //
  //   first message:  START -> researcher -> author -> END
  //   follow-up:      START -> chat -> END
  .addConditionalEdges("__start__", routeMessage, ["researcher", "chat"])
  .addEdge("researcher", "author")
  .addEdge("author", END)
  .addEdge("chat", END);

// The checkpointer is the agent's memory between messages. After every node
// finishes, it saves a copy of the state (topic, report, messages, ...). The
// next time the graph runs for the same conversation, it loads that copy
// first, which is how a follow-up "remembers" the report and earlier turns.
//
// MemorySaver keeps those copies in this server's RAM. That is simple and
// needs no database, but it means every conversation is forgotten when the
// server restarts (on Render's free plan, that includes when it goes to
// sleep after about 15 minutes without visitors).
const checkpointer = new MemorySaver()

// 3. Compile the structural map into a runnable agent application
const app = workflow.compile({ checkpointer });

// The layout a report follows when the caller doesn't supply its own
const DEFAULT_REPORT_STRUCTURE = `This article should be a practical clinical reference, structured as:
1. Introduction - why nutrition matters for immunocompromised patients (1-2 paragraphs)
2. One section per patient group (elderly, RVD/HIV, diabetes, cancer, infants and neonates, post-operative), each with key nutritional needs and foods to favour or avoid
3. Renal and hepatic dietary restrictions
4. Drug-nutrient interactions - a Markdown table of drug/class, food or nutrient, effect, and advice
5. Sample Kenyan meal plan - a Markdown table covering breakfast, lunch, supper and snacks
6. Conclusion - key safety takeaways as bullet points
7. Sources`

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
 * Checks whether a conversation has already produced its report, i.e.
 * whether the next message in it will be a follow-up rather than a first
 * question. The server uses this to apply a stricter rate limit to first
 * questions, which are far more expensive than follow-ups.
 *
 * @param threadId - The ID of the conversation to look up.
 * @returns true if the conversation exists and has a report.
 */
export async function conversationExists(threadId: string): Promise<boolean> {
    // getState asks the checkpointer for the latest saved state of this
    // conversation. For an ID it has never seen, `values` is simply empty.
    const saved = await app.getState({ configurable: { thread_id: threadId } })
    return Boolean(saved.values.report)
}

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
 * @returns The reply as Markdown, and its `kind`: "report" for the full
 *   report that opens a conversation, "chat" for a follow-up answer.
 */
export async function sendMessage(
    threadId: string,
    message: string
): Promise<{ reply: string; kind: "report" | "chat" }> {
    // Passing thread_id here is what makes the checkpointer load this
    // conversation's saved state before the graph runs, and save it after.
    const config = { configurable: { thread_id: threadId } }

    const isFirstMessage = !(await conversationExists(threadId))

    // We only pass in the fields that are new. Anything we leave out keeps
    // its saved value, so on a follow-up the topic, report and history are
    // all still there from the earlier runs.
    const input = isFirstMessage
        ? { question: message, topic: message, reportStructure: DEFAULT_REPORT_STRUCTURE }
        : { question: message }

    const state = await app.invoke(input, config)
    lastActive.set(threadId, Date.now())

    return { reply: state.answer, kind: isFirstMessage ? "report" : "chat" }
}

/**
 * Writes a one-off report for a topic, with no follow-up conversation. Used
 * when this file is run directly from the terminal.
 *
 * @param topic - What the report should be about.
 * @returns The generated report as a Markdown string.
 */
async function generateReport(topic: string): Promise<string> {
    // A fresh random ID means a brand-new conversation, so the message is
    // treated as a first question and gets the full report.
    const { reply } = await sendMessage(randomUUID(), topic)
    return reply
}

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

