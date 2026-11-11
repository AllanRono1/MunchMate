import { StateGraph, Annotation, END } from "@langchain/langgraph"
import { writeFile } from "node:fs/promises"
import { marked } from "marked"
import { model, research, WEB_SEARCH_TOOL, KENYAN_SEARCH_TOOL, KENYAN_LABEL } from "./agent"

// The REPORT graph (researcher -> author). It writes one long report and is
// only used from the terminal, with `npm run report`. The website uses the
// chat graph in agent.ts instead; both share the search tools and the ReAct
// researcher defined there.

//define the memory schema for the report graph

const AgentState = Annotation.Root({
    topic: Annotation<string>(), //input provided by the user
    reportStructure: Annotation<string>(), //input provided by the user: the layout the report must follow
    researchData: Annotation<string[]>(), //saved by Researcher, read by Author
    report: Annotation<string>(), //saved by the author as the final output
})

// The most searches the report researcher may run, including the Kenyan
// one. A report covers many angles, so it gets far more than a chat message.
const REPORT_MAX_SEARCHES = 12

/**
 * LangGraph node that gathers research context for the report topic.
 *
 * It hands the topic and the report structure to the ReAct researcher
 * (`research`), which works out which angles need searching, reads what
 * each search returns, and searches again where something is still
 * missing. The deduplicated results become the research context that
 * `authorNode` reads.
 *
 * @param state - Current graph state; reads `state.topic` and
 *   `state.reportStructure`.
 * @returns A partial state update setting `researchData` to the deduplicated
 *   list of search-result snippets. LangGraph merges this into the full
 *   state automatically.
 */
async function researcherNode(state: typeof AgentState.State) {
    console.log("--- RUNNING RESEARCHER PHASE ---")

    const instructions = `You are the researcher for a clinical nutrition report. You find the evidence; someone else writes the report. You never write the report yourself.

You have two search tools: ${WEB_SEARCH_TOOL} (the whole web) and ${KENYAN_SEARCH_TOOL} (Kenyan government and research sites only). You can run up to ${REPORT_MAX_SEARCHES - 1} searches in total.

How to work:
- Read the topic and the report structure, and work out which angles need evidence. Every section of the structure needs some.
- Angles to cover: nutrition for elderly patients; patients on Revlimid (lenalidomide), Velcade (bortezomib) and dexamethasone; HIV patients; diabetes patients; cancer patients; infants and neonates; post-operative patients; renal and hepatic dietary restrictions; drug-nutrient interactions (grapefruit, vitamin K, tyramine, potassium, St John's Wort, calcium/iron timing, CYP450 inducers and inhibitors); and affordable Kenyan foods and meals.
- Search for the most important angles first. You may ask for several searches at once.
- Read the results of every search before deciding what to do next. If a result is off-topic, too general, or leaves out something the report needs, search again with a more specific query.
- Each query must cover a different angle and make sense on its own. Prefer authoritative sources (clinical guidelines, government bodies, academic papers).
- Use ${KENYAN_SEARCH_TOOL} for Kenyan foods, meals and local guidance.
- When every section has enough evidence, stop: reply with the single word DONE and do not call a tool.`

    const task = `Report topic: ${state.topic}

Report structure:
${state.reportStructure}`

    const researchData = await research(
        instructions,
        [{ role: "user", content: task }],
        REPORT_MAX_SEARCHES,
        state.topic
    )

    return { researchData }
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

Each context entry starts with its title and a "Link:" line. Entries that start with "${KENYAN_LABEL}" come from Kenyan government or research bodies; prefer them for Kenyan foods and meals, but never copy "${KENYAN_LABEL}" into the report.

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
 * finished report.
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

runAgent();
