import { ChatOpenAI } from "@langchain/openai"
import * as dotenv from "dotenv"

dotenv.config()

const model = new ChatOpenAI({
  configuration: { baseURL: "https://openrouter.ai/api/v1" },
  modelName: "nvidia/nemotron-3-nano-30b-a3b",
  apiKey: process.env.OPENROUTER_API_KEY
})

const prompt = `You are an elite research assistant. 
Your goal is to generate targeted web search queries 
that will gather information for writing a technical report 
section

Topic of this section:
${state.topic}

When generating ${state.topic} search queries, ensure they:
1.Cover different aspects of the topic(e.g, core features, real world applications, technical architecture)
2.Include specific technical terms related to the topic
3.Target recent years by including year markers where relevant(e.g, "2024")
4.Look for comparisons or differentiators from similar technologies/ approaches
5. Search for both official documentation and practical implementation examples

Your queries should be:
-Specific enough to avoid generic results
-Diverse enough to cover all aspects of the section plan
-Focused on authoritative sources(documentation, technical blogs, academic papers)
`

