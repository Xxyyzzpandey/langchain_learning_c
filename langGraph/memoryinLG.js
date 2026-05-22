// In LangGraph, Persistence means saving the exact state of your graph (the conversation history, 
// variables, and decisions) to a database or memory storage after every single node executes.
// LangGraph uses a built-in concept called a Checkpointer to do this.
// You can give a specific user a thread_id. When User A talks to the bot, they get 
// thread_id: "user-123". When User B talks, they get thread_id: "user-456". LangGraph keeps 
// their state notebooks entirely isolated and saved.

//In-momory(local)
import { StateGraph, START, END } from "@langchain/langgraph";
import { MemorySaver } from "@langchain/langgraph"; // Import the checkpointer
const workflow = new StateGraph(AgentState)
  .addNode("agent", callModelNode)
  .addNode("tools_processor", toolsProcessorNode)
  .addEdge(START, "agent")
  .addConditionalEdges("agent", routeAfterModel)
  .addEdge("tools_processor", "agent");
// Instantiate memory storage
const memory = new MemorySaver();
// Compile the graph WITH the checkpointer attached
const app = workflow.compile({ checkpointer: memory });

//adding thread_id ways
// --- First Turn ---
const config = { configurable: { thread_id: "chat-session- Lucknow-2026" } };
const response1 = await app.invoke(
  { messages: [{ role: "user", content: "Hi! My name is Ankit." }] },
  config // Pass the config here
);
console.log(response1.messages.at(-1).content); 
// Output: "Hello Ankit! How can I help you today?"
// --- Second Turn (Notice we don't mention the name here!) ---
const response2 = await app.invoke(
  { messages: [{ role: "user", content: "What is my name?" }] },
  config // Pass the SAME config with the SAME thread_id
);
console.log(response2.messages.at(-1).content); 
// Output: "Your name is Ankit!"

//add mongodb atlas vector search for persistence
import { MongoClient } from "mongodb";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import { StateGraph, START, END } from "@langchain/langgraph";
// 1. Connect to MongoDB Atlas
const client = new MongoClient(process.env.MONGODB_ATLAS_URI);
await client.connect();
const db = client.db("langgraph_agents");
const checkpointCollection = db.collection("checkpoints");
// 2. Initialize the MongoDB Checkpointer
const checkpointer = new MongoDBSaver({
  client,
  checkpointCollection,
});
// 3. Compile your graph with MongoDB Persistence
const app = workflow.compile({ checkpointer });