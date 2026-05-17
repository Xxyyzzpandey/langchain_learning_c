//llm is just a brain that only generate text they do not do something like search web , or calculate etc,
// tool is hand which do things like search web etc,we can use tool provided by lanchain or we can create 
// our own tool 

//custom tool create by users
import { DynamicTool } from "langchain/tools";
const weatherTool = new DynamicTool({
  name: "weather",  //llm identify by name
  description: "Get weather by city name", //llm use this to decidide when to use this
  func: async (city) => {
    return `Weather in ${city} is 35°C`;
  }
});

//we can make a custom tool in two ways retraival and manual tool 
//In manual tool we create a function and give logic to do thing if ai need to use this tool it 
// access tool and give it argument if needed and use this function 
import { DynamicTool } from "@langchain/core/tools";

// 1. You write the manual logic
const calculateOrderTool = new DynamicTool({
  name: "calculate_final_price",
  description: "Use this to calculate the final price including 18% GST tax. Input is the base price as a number.",
  
  // This is the manual function that runs on your server
  func: async (basePrice) => {
    const price = parseFloat(basePrice);
    const tax = price * 0.18;
    const total = price + tax;
    
    return `The base price is ${price}, GST is ${tax.toFixed(2)}, and the final total is ${total.toFixed(2)}.`;
  },
});


// The "Knowledge" Tool (Automated): You point the AI at a source (like a Vector Database or a Search Engine). 
// You don't write the search logic; LangChain handles the retrieval automatically.
import { createRetrieverTool } from "langchain/tools/retriever";
// 1. Link the Source
const retriever = myVectorStore.asRetriever();
// 2. Wrap it into a Tool
const searchResearchTool = createRetrieverTool(
  retriever, 
  {
    name: "security_research_search",
    description: "Search for information about latest vulnerabilities and red teaming tactics.",
  }
);

//for live search from internet
import { DynamicTool } from "@langchain/core/tools";
const liveSearchTool = new DynamicTool({
  name: "live_web_search",
  description: "Use this tool to get real-time information from the internet. Input should be a search query.",
  // The 'func' is the manual logic where you hit a real API
  func: async (query) => {
    try {
      // 1. You use a real search API (like Tavily or Serper)
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: process.env.TAVILY_API_KEY,
          query: query,
          num_results: 3
        }),
      });
      const data = await response.json();
      // 2. You "clean" the data so the AI doesn't get overwhelmed by HTML/JSON
      const results = data.results
        .map((res) => `Title: ${res.title}\nContent: ${res.content}`)
        .join("\n\n");
      // 3. Return the clean text to the AI
      return results || "No results found.";
    } catch (error) {
      return "Error connecting to the live search service.";
    }
  },
});


// Implementing tool selection logic is all about how you bind those tools to your LLM. 
// In modern LangChain (LCEL), we use the .bindTools() method to "register" tools with 
// the model's brain.

// Two ways of tool selections
// The "Automatic" Selection (The ReAct Agent)
// This is the standard way. You give the AI a list of tools, and it uses its own reasoning 
// logic to select which one to call.
import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "langchain/agents";
import { AgentExecutor } from "langchain/agents";
// 1. Define your tools
const tools = [searchTool, sqlQueryTool];
// 2. The logic is handled by binding tools to the model
const modelWithTools = new ChatOpenAI({ model: "gpt-4" }).bindTools(tools);
// 3. The Agent uses the model's tool-calling capability to choose
const agent = await createReactAgent({
  llm: modelWithTools,
  tools,
  prompt,
});
const executor = new AgentExecutor({ agent, tools });

// The "Forced" Selection (The Tool Choice Parameter)
// Sometimes you don't want the AI to decide. You want to force it to use a specific tool,
//  or at least force it to use some tool instead of just talking. You implement this using 
// OPTION A: Force the AI to use EXACTLY the 'sqlQueryTool'
const forcedSqlModel = new ChatOpenAI({ model: "gpt-4" }).bindTools(tools, {
  tool_choice: "sqlQueryTool", 
});
// OPTION B: Force the AI to use ANY tool (it cannot just reply with text)
const mustUseToolModel = new ChatOpenAI({ model: "gpt-4" }).bindTools(tools, {
  tool_choice: "required", // Or "any" depending on the provider
});
// OPTION C: Let the AI decide (Default)
const defaultModel = new ChatOpenAI({ model: "gpt-4" }).bindTools(tools, {
  tool_choice: "auto",
});

// "Pre-Filter" Selection Logic (Middleware Pattern)
// If we have 50 tools, the AI will get confused and waste tokens. You can implement 
// your own "Pre-Selection" logic in JavaScript to only show the AI the relevant tools.
async function runSmartAgent(userInput) {
  let filteredTools = [];
  // Manual logic to filter tools before the AI even sees them
  if (userInput.includes("database") || userInput.includes("order")) {
    filteredTools = [sqlQueryTool];
  } else {
    filteredTools = [searchTool, chatTool];
  }
  // Create the agent ONLY with the filtered subset
  const agent = await createReactAgent({
    llm: model.bindTools(filteredTools),
    tools: filteredTools,
    prompt,
  });
  const executor = new AgentExecutor({ agent, tools: filteredTools });
  return await executor.invoke({ input: userInput });
}

//multi tool workflow
// A Multi-Tool Workflow is when your AI doesn't just use one tool, but orchestrates a series
// of actions—either in parallel (at the same time) or sequentially (one after another)—to solve
// a complex problem.