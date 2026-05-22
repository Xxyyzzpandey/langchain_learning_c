// Human-in-the-Loop allows you to configure your graph to automatically pause right before executing 
// a specific node, save its state, and wait for a human operator to review, approve, or modify the 
// data before resuming.

// We use the interrupt() function inside our node. This acts as an immediate stop sign.
import { interrupt } from "@langchain/langgraph";

// This node executes a sensitive financial transaction
async function executePaymentNode(state) {
  console.log("--- entering payment execution node ---");
  // 1. Trigger the interrupt. This immediately halts the graph execution!
  // The string argument is the message/context sent to the human reviewer.
  const userApproval = interrupt("Are you sure you want to authorize this $50 transaction?");
  // 2. Once the graph resumes, the value passed by the human lands right here
  console.log(`--- human response received: ${userApproval} ---`);
  if (userApproval === "APPROVED") {
    return { messages: [{ role: "assistant", content: "Payment processed successfully!" }] };
  } else {
    return { messages: [{ role: "assistant", content: "Transaction cancelled by human supervisor." }] };
  }
}

// The "Human-in-the-Loop" architecture in LangGraph is a design pattern used to pause an autonomous 
// agent's execution loop before it performs critical or sensitive actions, such as executing financial
//  transactions, sending emails, or deleting data. When the system encounters a native interrupt() 
//  function inside a node, it halts execution immediately and captures a complete state snapshot, 
//  which is safely serialized into a persistent database like MongoDB via a checkpointer. While the 
//  graph is frozen or "asleep" in storage, control is yielded back to the application, allowing an 
//  external user interface to inspect the current state and render interactive components like
//   approval forms or confirmation pop-ups. To wake up the agent and resume the workflow, the 
//   application triggers .invoke() again by passing a specialized Command object containing a 
//   resume payload. LangGraph then thaws the frozen session from the database, injects the human's 
//   response—whether it is a binary approval string like "YES" or "NO," or rich contextual 
//   feedback—directly into the variable where the interrupt occurred, and allows the node to 
//   continue executing its conditional logic down the remaining path to completion.

// workflow that ask for human approval to delete user
import { Annotation, StateGraph, START, END, Command, interrupt } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { ChatOpenAI } from "@langchain/openai";
import { MemorySaver } from "@langchain/langgraph";
import { z } from "zod";

const deleteUserFromDbTool = tool(
  async ({ userId }) => {
    console.log(`\n💥 [DB TOOL EXECUTING] Permanently purging user ID: ${userId} from the database.`);
    return `Success: User record ${userId} has been completely removed from the database.`;
  },
  {
    name: "delete_user_account",
    description: "Permanently deletes a user profile and all associated data from the database using their unique User ID.",
    schema: z.object({
      userId: z.string().describe("The exact alphanumeric database identifier of the user to delete"),
    }),
  }
);
const toolbox = [deleteUserFromDbTool];
const AgentState = Annotation.Root({
  messages: Annotation({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
});
// Node A: The Brain (LLM Node)
async function callModelNode(state) {
  console.log("\n🧠 [LLM Node] Analyzing request history...");
  const modelWithTools = new ChatOpenAI({ 
    model: "gpt-4o", 
    temperature: 0 
  }).bindTools(toolbox);
  const response = await modelWithTools.invoke(state.messages);
  return { messages: [response] };
}

// Node B: The Gatekeeper Node (Where we stop and ask for permission!)
async function gatekeeperNode(state) {
  console.log("🛑 [Gatekeeper Node] Sensitive operation detected! Halting execution graph...");
  // Find the tool call parameters that the LLM generated so we can show it to the human
  const lastMessage = state.messages[state.messages.length - 1];
  const targetToolCall = lastMessage.tool_calls[0];
  const targetUserId = targetToolCall.args.userId;
  // CRITICAL POINT: The graph freezes right here and saves everything to the database.
  // The string inside interrupt() is saved as metadata for your frontend UI to display.
  const humanDecision = interrupt(`WARNING: Are you sure you want to permanently delete user ID: "${targetUserId}"?`);
  console.log(`\n⚡ [Gatekeeper Node] Waking up! Received human decision: "${humanDecision}"`);
  if (humanDecision === "APPROVED") {
    // If approved, we pass control to the ToolNode by changing nothing
    return;
  } else {
    // If rejected, we short-circuit the tool call by injecting a cancellation notice back to the LLM
    console.log("❌ [Gatekeeper Node] Action Denied. Cancelling tool request.");
    const cancellationMessage = {
      role: "tool",
      content: "Operation aborted: The administrator explicitly REJECTED the deletion request.",
      tool_call_id: targetToolCall.id,
    };
    // We append the cancellation message and explicitly tell the graph to bypass the tool execution node
    return new Command({
      update: { messages: [cancellationMessage] },
      goto: "agent" // Route back to the LLM so it can wrap up nicely and tell the user it failed
    });
  }
}
// Node C: Prebuilt Tool Node
const toolsProcessorNode = new ToolNode(toolbox);
function routeAfterModel(state) {
  const lastMessage = state.messages[state.messages.length - 1];
  // If the LLM wants to delete a user, don't let it run yet! Route it to the Gatekeeper.
  if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
    return "gatekeeper";
  }
  return END;
}
const memory = new MemorySaver(); // Keeps the thread state in RAM for testing
const workflow = new StateGraph(AgentState)
  .addNode("agent", callModelNode)
  .addNode("gatekeeper", gatekeeperNode)
  .addNode("tools_processor", toolsProcessorNode)
  
  .addEdge(START, "agent")
  .addConditionalEdges("agent", routeAfterModel)
  .addEdge("gatekeeper", "tools_processor") // Moves to execution if gatekeeper didn't short-circuit
  .addEdge("tools_processor", "agent");     // Loops back to LLM to report results

const app = workflow.compile({ checkpointer: memory });

const config = { configurable: { thread_id: "session_user_purge_01" } };

console.log("\n=================== STEP 1: USER RUNS COMMAND ===================");
const step1Result = await app.invoke({
  messages: [{ role: "user", content: "Please completely delete user account usr_987654 from the database." }]
}, config);
// Inspect state to confirm it's frozen
const snapshot = await app.getState(config);
if (snapshot.tasks[0]?.interrupts?.length > 0) {
  console.log(`\n📋 UI Notification Server: The graph is currently PAUSED.`);
  console.log(`📋 Prompt shown to Admin UI: "${snapshot.tasks[0].interrupts[0].value}"`);
}
console.log("\n=================== STEP 2: ADMIN SUBMITS APPROVAL ===================");
// Simulate an administrator hitting the "Approve" button on a React/Node backend interface
console.log("Simulating Admin clicking [APPROVE]...");
const finalResult = await app.invoke(
  new Command({ resume: "APPROVED" }), // Resume the graph thread by injecting the approval string
  config
);
console.log("\n=================== STEP 3: FINAL AGENT WRAP-UP ===================");
console.log("Final Agent Answer:", finalResult.messages.at(-1).content);