import { StateGraph, Annotation, END } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import * as dotenv from "dotenv";

dotenv.config();

// Defining the memory schema
const AgentState = Annotation.Root({
  topic: Annotation<string>(),         // Input provided by the user
  researchData: Annotation<string[]>(), // Saved by Researcher, read by Author
  reportDraft: Annotation<string>(),   // Saved by Author as the final output
});
async function researcherNode(state: typeof AgentState.State) {
  console.log("--- RUNNING RESEARCHER PHASE ---");
  
  // Query the Tavily REST API directly
  const response = await fetch("https://tavily.com", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY,
      query: `detailed technical overview of ${state.topic}`,
      max_results: 3,
    }),
  });

  const searchData = await response.json();
  
  // Extract and isolate only the raw text snippets
  const contextStrings: string[] = searchData.results?.map((res: any) => res.content) || [];
  
  // Update the central state with the findings
  return { researchData: contextStrings };
}
async function authorNode(state: typeof AgentState.State) {
  console.log("--- RUNNING AUTHOR PHASE ---");
  
  // Connect to the free OpenRouter Nemotron endpoint
  const model = new ChatOpenAI({
    configuration: { baseURL: "https://openrouter.ai" },
    modelName: "nvidia/nemotron-3-nano-30b-a3b:free",
    openAIApiKey: process.env.OPENROUTER_API_KEY,
  });

  // Combine the gathered snippets into a solid text block
  const context = state.researchData.join("\n\n");
  
  const prompt = `You are an elite research assistant. 
Using the real-time context below, write a professional report about: ${state.topic}.
Use clear Markdown headers, bullet points, and an objective tone.

CONTEXT:
${context}

REPORT:`;

  const response = await model.invoke(prompt);
  
  // Update the final state entry with the generated text
  return { reportDraft: response.content as string };
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
async function runAgent() {
  const result = await app.invoke({ topic: "AI Streaming Architectures in 2026" });
  console.log("\n====== GENERATED REPORT ======\n");
  console.log(result.reportDraft);
}

runAgent();
