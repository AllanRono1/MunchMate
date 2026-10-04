import{StateGraph, Annotation, END, MemorySaver} from "@langchain/langgraph"
import {ChatOpenAI} from "@langchain/openai"
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
// for each request. Created once here so
// both the chat node (website conversations) and the author node (the
// terminal report) share the same model.
const model = new ChatOpenAI({
    configuration: { baseURL: "https://openrouter.ai/api/v1" },
    modelName: "nvidia/nemotron-3-super-120b-a12b:free",
    apiKey: process.env.OPENROUTER_API_KEY
})

// This file holds two separate graphs:
//
//   1. The REPORT graph (researcher -> author). It writes one long report
//      and is only used from the terminal, with `npm run report`.
//   2. The CHAT graph (a single chat node). It answers one specific question
//      at a time and remembers the conversation. This is what the website
//      uses.
//
// Each graph has its own state, because they need to remember different
// things. The report graph comes first.

//define the memory schema for the report graph

const AgentState = Annotation.Root({
    topic: Annotation<string>(), //input provided by the user
    reportStructure: Annotation<string>(), //input provided by the user: the layout the report must follow
    researchData: Annotation<string[]>(), //saved by Researcher, read by Author
    report: Annotation<string>(), //saved by the author as the final output
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

    // The whole conversation so far. The two fields above are simply
    // overwritten when a node returns a new value, but for the history we
    // want to ADD to what is already there. A "reducer" tells LangGraph how
    // to combine the saved value with a node's update: here, by appending
    // the new turns to the end of the existing list.
    messages: Annotation<ChatTurn[]>({
        reducer: (existing, update) => existing.concat(update),
        default: () => [], //a brand-new conversation starts with no history
    }),
})


// How many earlier turns the chat node sends to the model with each new
// question. A model can only read a limited amount of text per request, and
// every extra turn makes the request slower, so we send only the most recent
// ones. 10 turns = the last 5 questions and their 5 answers.
const HISTORY_LIMIT = 10

// Tavily rejects search queries longer than 400 characters.
const MAX_SEARCH_QUERY_LENGTH = 400

/**
 * LangGraph node that answers one question in a conversation. Every message
 * a visitor sends on the website comes through here.
 *
 * It does three things:
 *   1. Runs a web search for the question, so the answer is based on real
 *      sources rather than only on what the model remembers.
 *   2. Builds a request for the model out of: instructions, the search
 *      results, the recent conversation, and finally the new question.
 *   3. Saves the model's reply and adds the exchange to the history.
 *
 * @param state - Current graph state; reads `state.question` and
 *   `state.messages`.
 * @returns A partial state update setting `answer` to the model's reply and
 *   adding the question and reply to `messages`.
 */
async function chatNode(state: typeof ChatState.State) {
    console.log("--- RUNNING CHAT PHASE ---")

    // 1. Search the web for the question.
    //
    // Follow-up questions often make no sense alone: "can they eat mangoes?"
    // is only searchable once we know who "they" are. So if the visitor has
    // asked something before, we put their previous question in front of the
    // new one to give the search that context.
    //
    // findLast walks the history backwards and returns the most recent turn
    // spoken by the visitor (undefined if this is their first question).
    const previousQuestion = state.messages.findLast((turn) => turn.role === "user")?.content
    const searchQuery = (previousQuestion ? `${previousQuestion} ${state.question}` : state.question)
        .slice(0, MAX_SEARCH_QUERY_LENGTH)

    let searchResults = "(no search results were found)"
    try {
        const searchData = await tavilyClient.search(searchQuery, { maxResults: 5 })
        if (searchData.results?.length) {
            // Number each result and keep its title and link next to its
            // text, so the model can tell the visitor where a fact came from.
            searchResults = searchData.results
                .map((res, i) => `[${i + 1}] ${res.title}\nLink: ${res.url}\n${res.content.trim()}`)
                .join("\n\n")
        }
    } catch (error) {
        // A failed search should not end the conversation. The model can
        // still answer from the history and its own knowledge, so log and
        // carry on.
        console.warn(`Search failed for question "${state.question}":`, error)
    }

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
- If you used the search results, end with a "Sources:" list of the ones you used, each written as a Markdown link with its title, like [Title](https://link).
- The user cannot see the search results or their numbers, so never refer to a result by its number.
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

// The chat graph has a single step: every message goes to the chat node.
//
//   START -> chat -> END
const chatWorkflow = new StateGraph(ChatState)
  .addNode("chat", chatNode)
  .addEdge("__start__", "chat")
  .addEdge("chat", END);

// The checkpointer is the agent's memory between messages. After the chat
// node finishes, it saves a copy of the state (including `messages`). The
// next time the graph runs for the same conversation, it loads that copy
// first, which is how the agent "remembers" the earlier questions.
//
// MemorySaver keeps those copies in this server's RAM. That is simple and
// needs no database, but it means every conversation is forgotten when the
// server restarts (on Render's free plan, that includes when it goes to
// sleep after about 15 minutes without visitors).
const checkpointer = new MemorySaver()

const chatApp = chatWorkflow.compile({ checkpointer });

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

