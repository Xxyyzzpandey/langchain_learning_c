// In complex software engineering, a single monolithic agent with 20 different tools often gets 
// overwhelmed. The LLM gets confused about which tool to call, struggles to track complex states, 
// and hallucinates parameters.

// Multi-Agent Architecture solves this by breaking down a massive problem into a team of specialized,
// small agents. Each agent acts as an independent node in your graph, possesses its own specific 
// system instructions, and owns a highly restricted set of tools. They pass the conversation history
// back and forth to each other like coworkers in an office.

// three primary architectural design patterns used to structure multi-agent systems.
// The Supervisor / Router (Hub-and-Spoke)
// In this pattern, a single centralized Supervisor Node acts as the manager. The user never talks 
// directly to the workers. The Supervisor evaluates the conversation history, decides which 
// specialized worker agent should execute the next step, and routes the state to them. When a worker 
// finishes, it always returns control back to the Supervisor.
import { Annotation, StateGraph, START, END, Command } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
const researchTool = tool(
  async ({ topic }) => {
    console.log(`\n🔍 [Tool] Searching documentation for: "${topic}"...`);
    if (topic.toLowerCase().includes("kafka")) {
      return "Apache Kafka is a distributed event store and stream-processing platform written in Java and Scala.";
    }
    return "General technology infrastructure documentation found.";
  },
  {
    name: "fetch_research_data",
    description: "Searches internal technical documentation for a given topic.",
    schema: z.object({ topic: z.string() }),
  }
);
const fileWriterTool = tool(
  async ({ filename, codeContent }) => {
    console.log(`\n💾 [Tool] Writing file "${filename}" to disk...`);
    return `Success: ${filename} has been saved with ${codeContent.length} characters of code.`;
  },
  {
    name: "write_code_to_file",
    description: "Saves generated code blocks into physical files on the disk layout.",
    schema: z.object({
      filename: z.string().describe("The name of the file, e.g., server.js"),
      codeContent: z.string().describe("The full code content to write inside the file"),
    }),
  }
);
// Group tools by the respective agent that owns them
const researcherToolbox = [researchTool];
const coderToolbox = [fileWriterTool];
// Combine all tools for the global ToolProcessorNode
const globalToolbox = [...researcherToolbox, ...coderToolbox];
const toolsProcessorNode = new ToolNode(globalToolbox);
const TeamState = Annotation.Root({
  messages: Annotation({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  // Tracking variable used by the supervisor to prevent infinite routing loops
  nextAssignee: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => "SUPERVISOR",
  })
});
// Worker A: The Researcher Persona
async function researcherNode(state) {
  console.log("\n🕵️‍♂️ [Researcher Agent] Reviewing task objectives...");
  const modelWithTools = new ChatOpenAI({ model: "gpt-4o", temperature: 0 }).bindTools(researcherToolbox);
  // Inject a system prompt modifying this run context dynamically
  const contextPrompt = {
    role: "system",
    content: "You are an elite technical researcher. Use your tools to gather accurate facts. When done, output your summary clearly."
  };
  const response = await modelWithTools.invoke([contextPrompt, ...state.messages]);
  // Always route back to the supervisor when done
  return new Command({
    update: { messages: [response] },
    goto: "supervisor"
  });
}
// Worker B: The Coder Persona
async function coderNode(state) {
  console.log("\n💻 [Coder Agent] Generating code blocks...");
  const modelWithTools = new ChatOpenAI({ model: "gpt-4o", temperature: 0 }).bindTools(coderToolbox);
  const contextPrompt = {
    role: "system",
    content: "You are a senior software engineer. Write clean code and save it using your tools based on provided research information."
  };
  const response = await modelWithTools.invoke([contextPrompt, ...state.messages]);
  // Always route back to the supervisor when done
  return new Command({
    update: { messages: [response] },
    goto: "supervisor"
  });
}
async function supervisorNode(state) {
  console.log("\n👔 [Supervisor Manager] Evaluation current conversation progress...");
  // We construct a schema enforcing structured output. The LLM *must* choose the next step.
  const routingSchema = z.object({
    reasoning: z.string().describe("Explanation of why we are picking the next assignee or finishing."),
    nextStep: z.enum(["RESEARCHER", "CODER", "FINISH"]).describe("The next persona entity to execute, or FINISH if complete.")
  });
  const supervisorModel = new ChatOpenAI({ model: "gpt-4o", temperature: 0 }).withStructuredOutput(routingSchema);
  const managerInstruction = {
    role: "system",
    content: `You are the project manager supervising a 'RESEARCHER' and a 'CODER'. 
    Your job is to analyze what has been done and assign the next task.
    - If the user wants information that isn't gathered yet, route to 'RESEARCHER'.
    - If information is gathered but code isn't written/saved, route to 'CODER'.
    - If the coder has successfully written out the necessary file, route to 'FINISH'.`
  };
  const decision = await supervisorModel.invoke([managerInstruction, ...state.messages]);
  console.log(`📊 [Supervisor Decision] Assigning task to: "${decision.nextStep}". Reason: ${decision.reasoning}`);
  return { nextAssignee: decision.nextStep };
}
function routeAfterSupervisor(state) {
  if (state.nextAssignee === "RESEARCHER") return "researcher";
  if (state.nextAssignee === "CODER") return "coder";
  return END;
}
function routeAfterWorkerTools(state) {
  const lastMessage = state.messages[state.messages.length - 1];
  // If a worker requested a tool call, route control directly to the execution box
  if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
    return "tools_processor";
  }
  // Otherwise, fallback step (handled natively by our Command overrides above, but clean to keep here)
  return "supervisor";
}
function routeAfterToolsProcessor(state) {
  // Identify which agent called the tool so we return control to that specific agent node
  const lastMessage = state.messages[state.messages.length - 1];
  const originalToolCallId = lastMessage.tool_call_id;
  // Look backward in history to find who generated that original tool call id
  for (let i = state.messages.length - 2; i >= 0; i--) {
    const msg = state.messages[i];
    if (msg.tool_calls?.some(tc => tc.id === originalToolCallId)) {
      if (msg.name === "Researcher" || msg.content?.includes("researcher")) return "researcher";
      return "coder"; 
    }
  }
  return "supervisor";
}
const workflow = new StateGraph(TeamState)
  .addNode("supervisor", supervisorNode)
  .addNode("researcher", researcherNode)
  .addNode("coder", coderNode)
  .addNode("tools_processor", toolsProcessorNode)

  // Start directly at the manager
  .addEdge(START, "supervisor")
  
  // Supervisor evaluates and breaks paths
  .addConditionalEdges("supervisor", routeAfterSupervisor)
  
  // Workers evaluate whether they need tools or route back to manager
  .addConditionalEdges("researcher", routeAfterWorkerTools)
  .addConditionalEdges("coder", routeAfterWorkerTools)
  
  // After tool executes, return back to the respective worker that needed it
  .addConditionalEdges("tools_processor", routeAfterToolsProcessor);

const app = workflow.compile();
const result = await app.invoke({
  messages: [{ 
    role: "user", 
    content: "Research what Apache Kafka is, and then save a file named 'kafka-notes.txt' containing a clean code snippet or summary of it." 
  }]
});
console.log("\n=================== FINAL CONVERSATION ENDED ===================");

// Peer-to-Peer Network (Choreography)
// In a Peer-to-Peer pattern, there is no manager. The agents collaborate directly. Agent A completes 
// its specialized task, looks at the state, and decides which peer agent is best qualified to handle 
// the next step. It routes the conversation directly to that peer.
const workflow = new StateGraph(PipelineState)
  // Register our peer nodes
  .addNode("researcher", researcherNode)
  .addNode("writer", writerNode)

  // Configure the linear flow straight from one peer to another
  .addEdge(START, "researcher")  // Step 1: Start at the researcher
  .addEdge("researcher", "writer") // Step 2: Move directly to the writer peer
  .addEdge("writer", END);         // Step 3: Finish the pipeline

// Hierarchical / Sub-Graphs (Teams)
// For highly sophisticated enterprise systems, a single supervisor graph can become overloaded. The 
// Hierarchical design pattern introduces Sub-Graphs. The top-level supervisor delegates a task to a 
// "Team Leader." That Team Leader is actually an entirely separate LangGraph instance running its own 
// inner worker agents and tools.
import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
// Private state used ONLY inside the sub-graph team
const CodingSubgraphState = Annotation.Root({
  codeRequirement: Annotation({ reducer: (x, y) => y ?? x, default: () => "" }),
  generatedCode: Annotation({ reducer: (x, y) => y ?? x, default: () => "" }),
  bugReport: Annotation({ reducer: (x, y) => y ?? x, default: () => "" }),
  iterationCount: Annotation({ reducer: (x, y) => x + y, default: () => 0 })
});
// Sub-graph Node 1: Write Code
async function writeCodeNode(state) {
  console.log(`  💻 [Sub-Graph] Writing code for requirement. Iteration: ${state.iterationCount + 1}`);
  const model = new ChatOpenAI({ model: "gpt-4o", temperature: 0 });
  let prompt = `Write a clean Node.js script using async/await for: ${state.codeRequirement}.`;
  if (state.bugReport) {
    prompt += `\nYour previous attempt failed with this error: ${state.bugReport}. Please fix it!`;
  }
  const response = await model.invoke(prompt);
  return { 
    generatedCode: response.content,
    iterationCount: 1 
  };
}
// Sub-graph Node 2: Test & Review
async function testCodeNode(state) {
  console.log("  🧪 [Sub-Graph] Code Quality Assurance checking for errors...");
  // We simulate a basic validation check to demonstrate self-correction loops
  if (!state.generatedCode.includes("try") && state.iterationCount < 2) {
    return { bugReport: "Missing error handling. Wrap the implementation inside a try/catch block." };
  }
  return { bugReport: "" }; // Code passes review!
}
// Sub-graph Router Edge
function checkTestResults(state) {
  if (state.bugReport && state.iterationCount < 3) {
    console.log("  ⚠️ [Sub-Graph] Bug detected! Routing back to code generator node.");
    return "write_code"; // Loop back to fix code
  }
  console.log("  ✅ [Sub-Graph] Code verified. Preparing handoff to parent graph.");
  return END;
}
// Assemble and compile the Sub-Graph
const subgraphWorkflow = new StateGraph(CodingSubgraphState)
  .addNode("write_code", writeCodeNode)
  .addNode("test_code", testCodeNode)
  .addEdge(START, "write_code")
  .addEdge("write_code", "test_code")
  .addConditionalEdges("test_code", checkTestResults);
const compiledSubgraph = subgraphWorkflow.compile();
// Global state used by the parent layout
const ParentState = Annotation.Root({
  topicName: Annotation({ reducer: (x, y) => y ?? x }),
  documentOutline: Annotation({ reducer: (x, y) => y ?? x, default: () => "" }),
  finalizedDocument: Annotation({ reducer: (x, y) => y ?? x, default: () => "" })
});
// Parent Node 1: Plan Outline
async function planOutlineNode(state) {
  console.log(`📝 [Parent Node] Creating layout document structure for: ${state.topicName}`);
  return { documentOutline: `# Documentation for ${state.topicName}\n\n## Section 1: Overview\nThis guide explains how to initialize your configuration.` };
}
// Parent Node 2: The bridge function invoking our compiled sub-graph
async function invokeCodingTeamSubgraph(state) {
  console.log("🚀 [Parent Node] Handing off code requirements down to the Coding Sub-Graph...");
  // 1. Transform parent state variables into child state schema format
  const subgraphInput = { codeRequirement: `An asynchronous function that connects to MongoDB Atlas for ${state.topicName}` };
  // 2. Invoke the compiled sub-graph cleanly like an isolated library
  const subgraphOutput = await compiledSubgraph.invoke(subgraphInput);
  // 3. Extract output artifacts from the sub-graph and stitch them back into the parent state
  const updatedLayout = `${state.documentOutline}\n\n## Section 2: Implementation Code Block\n\`\`\`javascript\n${subgraphOutput.generatedCode}\n\`\`\``;
  return { finalizedDocument: updatedLayout };
}
// Assemble the Parent Graph
const parentWorkflow = new StateGraph(ParentState)
  .addNode("plan_outline", planOutlineNode)
  // We register the custom wrapper function as a regular node
  .addNode("run_coding_subgraph", invokeCodingTeamSubgraph)
  
  .addEdge(START, "plan_outline")
  .addEdge("plan_outline", "run_coding_subgraph")
  .addEdge("run_coding_subgraph", END);

const app = parentWorkflow.compile();
console.log("=================== RUNNING HIERARCHICAL GRAPH ===================");
const finalResult = await app.invoke({ topicName: "User Profile Database Purge" });
console.log("\n=================== FINAL COMPLETE OUTPUT DOCUMENT ===================");
console.log(finalResult.finalizedDocument);