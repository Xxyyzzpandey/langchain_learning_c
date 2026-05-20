//An Agent is a system that uses an LLM to decide a sequence of actions to take.
//Why do we need it? You need an Agent whenever you don't know the exact steps required to solve a problem in advance.
import { createReactAgent } from "langchain/agents";
const agent = await createReactAgent({
  llm: model,    // The AI Model (GPT-4, Gemini, etc.)
  tools: myTools, // Your array of tools
  prompt: prompt, // Instructions on how to think
});

// The "ReAct" Pattern
// Most agents follow a loop called ReAct (Reason + Act). It looks like this:
// Thought: The AI writes down what it thinks it needs to do.
// Action: The AI chooses a tool to use.
// Action Input: The AI provides the parameters for that tool.
// Observation: The AI reads the result of that tool.
// Repeat: It repeats this until it has enough info to give a final answer.

// While the Agent is the "Brain" (making decisions), the AgentExecutor is the "Body" that actually does the work,
// handles errors, and keeps the loop running until the job is done.
import { AgentExecutor } from "langchain/agents";
// 1. Initialize the Executor
const executor = new AgentExecutor({
  agent: myAgent,       // The "Brain" we created earlier
  tools: myTools,       // The "Hands" (your array of tools)
  verbose: true,        // CRITICAL: This lets you see the "Thinking" in your terminal
  maxIterations: 5,     // Safety: Stop if it takes more than 5 steps
  handleParsingErrors: true // If the AI speaks gibberish, the executor fixes it
});
// 2. Run the Executor
const result = await executor.invoke({
  input: "Is it raining in Lucknow? If yes, find a nearby umbrella shop."
});
console.log(result.output);


//multi tool workflow ->that uses multiple tools calling for result
// single calling => uses tool one by one
// parallel calling => all tool parallelly 


// the Scratchpad is the "Short-Term Working Memory" or the "Internal Monologue" of the AI. 
// it is simply gives what is happening during processing this request
// Why do we need it?
// LLMs are "stateless." This means every time you send a prompt, the AI forgets what happened a 
// second ago unless you send the history back to it.
// When an Agent is in a Multi-Step Workflow, it needs to remember:
// "What did I just do?"
// "What tool did I just call?"
// "What was the result of that tool?"
// Without the scratchpad, the AI would get stuck in a loop calling the same tool over and over 
// because it forgot it already did it.

// The scratchpad is a specific variable (usually agent_scratchpad) that gets injected into 
// the prompt. It stores the Sequence of Thoughts and Actions.
// The Cycle:Prompt: "What is the price of BTC + 5%?" + (Scratchpad is empty).
// AI Thought: "I need to find the price first." -> Added to Scratchpad.
// Action: Calls search_tool.Observation: Result is "$60,000". -> Added to Scratchpad.
// Next Prompt: "What is the price of BTC + 5%?" + (Scratchpad: "I searched, result was $60k").
// AI Logic: "Now I can calculate the 5%."

// In LangChain, you don't usually manage the scratchpad manually; the AgentExecutor handles it. 
// However, you must include a placeholder for it in your Prompt Template.
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
const prompt = ChatPromptTemplate.fromMessages([
  ["system", "You are a helpful assistant with access to tools."],
  ["human", "{input}"], 
  // It tells LangChain: "Put the AI's internal thoughts and tool results here."
  new MessagesPlaceholder("agent_scratchpad"),
]);


//we can get scratchpad data by -->
// If you want to see the entire completed scratchpad after the AI finishes its task, 
// you can tell the executor to return it to you. This is very useful for debugging why an
// AI made a specific decision.
const executor = new AgentExecutor({
  agent,
  tools,
  returnIntermediateSteps: true, // This is the 'Scratchpad' data
});
const result = await executor.invoke({ input: "..." });
// result.output is the final answer
// result.intermediateSteps is an array of every thought/action in the scratchpad
console.log(result.intermediateSteps);


//we can also do the above using callbacks
const executor = new AgentExecutor({
  agent,
  tools,
  callbacks: [
    {
      //It gives you the Tool Name and the Input the AI wants to send to it.
      handleAgentAction(action, runId) {
        // 'action' contains the tool name and the arguments the AI chose
        console.log("AI is selecting tool:", action.tool);
        console.log("AI is passing these args:", action.toolInput);
      },
      //It gives you the Output (the "Observation") that the tool produced.
      handleToolEnd(output, runId) {
        // 'output' is the observation that just got added to the scratchpad
        console.log("Tool result just added to scratchpad:", output);
      },
      // Triggered if something breaks
      handleRetrieverError: (err) => {
        console.error("[ERROR]: Search failed!", err);
      }
    }
  ]
});

//summary
// Implementation: Just use the MessagesPlaceholder. Don't try to fill it yourself; LangChain will overwrite it anyway.
// Logging: Use verbose:true for development.
// Operations: Use returnIntermediateSteps:true if you want to store the AI's "reasoning path" in your database along with the final answer.

//adding memory to agents
import { BufferMemory } from "langchain/memory";
const memory = new BufferMemory({
  memoryKey: "chat_history", // Must match the name in your prompt placeholder
  returnMessages: true,      // Tells LangChain to return objects, not just a string
});
const executor = new AgentExecutor({
  agent,
  tools,
  memory, // Attach it here
});
// Now the agent remembers your name!
await executor.invoke({ input: "Hi, I am Ankit." });
await executor.invoke({ input: "What is my name?" });



//an agent with memory 
import { MongoDBAtlasVectorSearch } from "@langchain/mongodb";
import { OpenAIEmbeddings, ChatOpenAI } from "@langchain/openai";
import { MongoClient } from "mongodb";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { TavilySearchResults } from "@langchain/community/tools/tavily_search";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { MemorySaver } from "@langchain/langgraph";
// --- 1. SETUP MONGODB (Long-Term Knowledge Memory) ---
const client = new MongoClient(process.env.MONGODB_ATLAS_URI);
const collection = client.db("zapflow").collection("knowledge_base");
const vectorStore = new MongoDBAtlasVectorSearch(new OpenAIEmbeddings(), {
  collection,
  indexName: "vector_index", // Must match your Atlas Search Index name
});
// --- 2. DEFINE CUSTOM TOOL (Production Logic) ---
const orderTrackerTool = tool(
  async ({ orderId }) => {
    // In production, this would be a DB call to your marketSupply.ai database
    console.log(`Searching for Order: ${orderId}`);
    return `Order ${orderId} is currently 'In Transit' and will arrive in 2 days.`;
  },
  {
    name: "track_order",
    description: "Tracks the delivery status of a specific order ID.",
    schema: z.object({
      orderId: z.string().describe("The unique order ID, e.g., ORD-123"),
    }),
  }
);
// --- 3. INITIALIZE PRE-BUILT TOOLS ---
const searchTool = new TavilySearchResults({ maxResults: 2 });
const tools = [orderTrackerTool, searchTool];
// --- 4. CREATE THE AGENT WITH MEMORY ---
const llm = new ChatOpenAI({ model: "gpt-4o", temperature: 0 });
// MemorySaver handles the "Short-Term" conversation context
const memory = new MemorySaver();
const agent = createReactAgent({
  llm,
  tools,
  checkpointSaver: memory, // This is the automatic Short-Term Memory
});
// --- 5. EXECUTION FUNCTION ---
async function runProductionAgent(userInput, threadId) {
  // A. RETRIEVAL STEP: Get long-term context from MongoDB
  const relevantDocs = await vectorStore.similaritySearch(userInput, 2);
  const context = relevantDocs.map(d => d.pageContent).join("\n");
  // B. INVOKE AGENT: Pass the threadId to maintain separate chat sessions
  const config = { configurable: { thread_id: threadId } };
  const result = await agent.invoke(
    { 
      messages: [
        ["system", `Context from knowledge base: ${context}`],
        ["human", userInput]
      ] 
    }, 
    config
  );
  return result.messages[result.messages.length - 1].content;
}

// --- EXAMPLE USAGE ---
const sessionID = "user_ankit_001";
const response1 = await runProductionAgent("Hi, I'm Ankit. Check my order ORD-999.", sessionID);
console.log("AI:", response1);

const response2 = await runProductionAgent("When did I say it would arrive?", sessionID);
console.log("AI:", response2); // The agent remembers "Ankit" and the previous order result!