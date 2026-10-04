import * as dotenv from "dotenv";
dotenv.config();

console.log("===API KEY VERIFICATION===")

const openRouterKey = process.env.OPENROUTER_API_KEY
const tavilyKey = process.env.TAVILY_API_KEY

if(openRouterKey && openRouterKey.startsWith("sk-or-v1-")) {
    console.log("✅ OpenRouter Key: Loaded successfully with correct prefix.")
} else {
    console.log("❌ OpenRouter Key: Missing or invalid format (should start with sk-or-v1-).")
}

if(tavilyKey) {
    console.log("✅ Tavily Key: Loaded successfully.")
} else ("❌ Tavily Key: Missing.")