import * as dotenv from "dotenv";
import { ChatOpenAI } from "@langchain/openai";
import { tavily } from "@tavily/core";

dotenv.config();

console.log("=== LIVE API KEY VERIFICATION ===\n");

async function checkTavily() {
    const key = process.env.TAVILY_API_KEY;
    if (!key) {
        console.log("❌ Tavily: TAVILY_API_KEY not set");
        return;
    }
    try {
        const client = tavily({ apiKey: key });
        const result = await client.search("test", { maxResults: 1 });
        if (result.results) {
            console.log("✅ Tavily: key is valid — got a real response");
        } else {
            console.log("⚠️  Tavily: request succeeded but response looked unexpected");
        }
    } catch (err: any) {
        console.log("❌ Tavily: request failed —", err?.message || err);
    }
}

async function checkOpenRouter() {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) {
        console.log("❌ OpenRouter: OPENROUTER_API_KEY not set");
        return;
    }
    try {
        const model = new ChatOpenAI({
            configuration: { baseURL: "https://openrouter.ai/api/v1" },
            modelName: "nvidia/nemotron-3-nano-30b-a3b",
            apiKey: key,
        });
        const response = await model.invoke("Reply with just the word: pong");
        console.log("✅ OpenRouter: key is valid — model replied:", JSON.stringify(response.content));
    } catch (err: any) {
        console.log("❌ OpenRouter: request failed —", err?.message || err);
    }
}

async function main() {
    await checkTavily();
    await checkOpenRouter();
}

main();
