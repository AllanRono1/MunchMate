import{StateGraph, Annotation, END} from "@langchain/langgraph"
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

//define the memory schema

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

    // Connect to the free OpenRouter Nemotron endpoint
const model = new ChatOpenAI({
    configuration: { baseURL: "https://openrouter.ai/api/v1" },
    modelName: "nvidia/nemotron-3-nano-30b-a3b",
    apiKey: process.env.OPENROUTER_API_KEY
})

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
const app = workflow.compile();

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
 * Runs the whole graph (researcher -> author) for one topic and returns the
 * finished report. This is the single entry point the web server calls, so
 * the server never needs to know about nodes, state or LangGraph.
 *
 * @param topic - What the report should be about (the visitor's question).
 * @param reportStructure - The layout the report must follow.
 * @returns The generated report as a Markdown string.
 */
export async function generateReport(
    topic: string,
    reportStructure: string = DEFAULT_REPORT_STRUCTURE
): Promise<string> {
    const state = await app.invoke({ topic, reportStructure })
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

