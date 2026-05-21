// The State (The "Luggage") :-
// The State is a shared notebook or a suitcase that travels with you throughout the entire journey.
// Every stop you make can read what's inside it, add new things, or update it.
// Simple Definition: The shared memory of your program.
import { Annotation } from "@langchain/langgraph";
// This is our State definition. 
// It's an object that holds an array of messages and a category string.
const GraphState = Annotation.Root({
  messages: Annotation({
    reducer: (x, y) => x.concat(y), // This merges new messages into the existing list
    default: () => [],
  }),
  category: Annotation({
    reducer: (x, y) => y, // This simply replaces the old category with the new one
  })
});



// Nodes (The "Destinations / Stops") :-
// Nodes are the actual steps, actions, or functions in your workflow. They do the heavy lifting. 
// A node takes the current State, does some work (like calling an LLM or fetching data), updates
// the State, and passes it along.
//** node should return object */
const greetNode = async (state) => {
  return {
    answer: `Hello ${state.name}`
  };
};
// Node Can Do Anything
// Inside node you can:
// call LLM
// call database
// use tools
// do RAG retrieval
// call API
// validation
// calculations
// This is where logic happens.

const llmNode = async (state) => {
  const response = await model.invoke(state.question);
  return {
    answer: response.content
  };
};
//node calling db 
const dbNode = async (state) => {
  const user = await User.findById(state.userId);
  return {
    username: user.name
  };
};
//node using tools
import { tool } from "@langchain/core/tools";
const weatherTool = tool(
  async ({ city }) => {
    return `Weather in ${city} is 35°C`;
  },
  {
    name: "weather_tool",
    description: "Get weather by city name",
    schema: z.object({
      city: z.string(),
    }),
  }
);
import { Annotation } from "@langchain/langgraph";
const GraphState = Annotation.Root({
  city: Annotation<string>(),
  toolResult: Annotation<string>(),
});
const weatherNode = async (state) => {
  const result = await weatherTool.invoke({
    city: state.city,
  });
  return {
    toolResult: result,
  };
};


// Edges (The "Roads") :-
// Edges define the direction of travel. They connect the nodes together and determine where the
// program goes next.
// There are two types of edges:
// Normal Edges: Direct roads. (e.g., "After Node A is finished, always go straight to Node B").
// from one node to another with checking anything
graph.addEdge("retrieveNode", "llmNode");
//full direct node arcticture
graph.addEdge(START, "retrieveNode");
graph.addEdge("retrieveNode", "llmNode");
graph.addEdge("llmNode", END);

// Conditional Edges: A fork in the road with a signpost. It looks at the current State and makes a 
// decision. (e.g., "Check the budget in the State. If budget > $500, go to Luxury Hotel Node. 
// If budget < $500, go to Hostel Node").
const routeNode = (state) => {
  if (state.city) {
    return "weatherNode"; //it is returning node to call
  }
  if (state.productId) {
    return "productNode";
  }
  return "llmNode";
};
//full conditional edge
const classifyNode = async (state) => {
  console.log("Checking user question...");
  return state;
};
const weatherNode = async (state) => {
  console.log("Weather tool called");

  return state;
};
const productNode = async (state) => {
  console.log("Product DB called");

  return state;
};
const routeNode = (state) => {
  const question = state.userQuestion.toLowerCase();
  if (question.includes("weather")) {
    return "weatherNode";
  }
  return "productNode";
};
const graph = new StateGraph(GraphState)
  .addNode("classifyNode", classifyNode)
  .addNode("weatherNode", weatherNode)
  .addNode("productNode", productNode)
  .addEdge(START, "classifyNode")
  // CONDITIONAL EDGE HERE
//   classifyNode runs first
//          ↓
//   then graph asks:
//   Where should I go next?
  .addConditionalEdges(
    "classifyNode",
    routeNode
  )
  .addEdge("weatherNode", END)
  .addEdge("productNode", END);


// LLM based routing -> where llm will decide where to go(on which node next)
import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
// Tool A: Company Ticker Search
const searchTickerTool = tool(
  async ({ companyName }) => {
    console.log(`\n--- [Tool 1] Searching ticker for: ${companyName} ---`);
    if (companyName.toLowerCase().includes("apple")) return "Ticker symbol for Apple is AAPL.";
    if (companyName.toLowerCase().includes("tesla")) return "Ticker symbol for Tesla is TSLA.";
    return `Could not find a ticker for ${companyName}.`;
  },
  {
    name: "search_ticker",
    description: "Step 1: Use this first to find the stock ticker symbol of a company by its name.",
    schema: z.object({ companyName: z.string() }),
  }
);
// Tool B: Stock Price Fetcher
const getStockPriceTool = tool(
  async ({ ticker }) => {
    console.log(`\n--- [Tool 2] Fetching stock price for ticker: ${ticker} ---`);
    if (ticker.toUpperCase() === "AAPL") return "The current stock price of AAPL is $180.";
    if (ticker.toUpperCase() === "TSLA") return "The current stock price of TSLA === $170.";
    return `Stock data unavailable for ${ticker}.`;
  },
  {
    name: "get_stock_price",
    description: "Step 2: Use this to get the current trading price after you have discovered the ticker symbol.",
    schema: z.object({ ticker: z.string() }),
  }
);
// Tool C: Tax/Risk Calculator
const calculateRiskTool = tool(
  async ({ stockPrice, sharesCount }) => {
    console.log(`\n--- [Tool 3] Calculating total investment risk value for price: $${stockPrice} ---`);
    const totalCost = stockPrice * sharesCount;
    return `The total cost to acquire ${sharesCount} shares at this price is $${totalCost}.`;
  },
  {
    name: "calculate_investment_cost",
    description: "Step 3: Performs multiplication calculations to find the final portfolio acquisition value.",
    schema: z.object({
      stockPrice: z.number().describe("The numeric raw stock price"),
      sharesCount: z.number().describe("Number of shares to buy"),
    }),
  }
);
// Pack all three tools into our environment array
const multiToolbox = [searchTickerTool, getStockPriceTool, calculateRiskTool];
const AgentState = Annotation.Root({
  messages: Annotation({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
});
//state is array of object which contains my conversation and llm response and if llm deside to use
//tool it add tool_calls object in it , which helps me to find wheather to end conversation or move further
async function callModelNode(state) {
  console.log("--- [LLM Node] Evaluating history and determining next action... ---");
  const modelWithTools = new ChatOpenAI({ 
    model: "gpt-4o", 
    temperature: 0 
  }).bindTools(multiToolbox);
  const response = await modelWithTools.invoke(state.messages);
  return { messages: [response] };
}
// Instantiate automated tool processing for all tools
const toolsProcessorNode = new ToolNode(multiToolbox);
function routeAfterModel(state) {
  const lastMessage = state.messages[state.messages.length - 1];
  if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
    return "tools_processor";
  }
  return END;
}
// Assemble the cyclic engine graph
const workflow = new StateGraph(AgentState)
  .addNode("agent", callModelNode)
  .addNode("tools_processor", toolsProcessorNode)
  .addEdge(START, "agent")
  .addConditionalEdges("agent", routeAfterModel)
  .addEdge("tools_processor", "agent"); // Essential cycle for multi-step tasks

const app = workflow.compile();
const finalResult = await app.invoke({
  messages: [{ 
    role: "user", 
    content: "I want to purchase 50 shares of Apple. Can you find their ticker, check the current price, and calculate my total cost?" 
  }],
});
console.log("\n=================== FINAL ANSWER ===================");
console.log(finalResult.messages.at(-1).content);


//another example where what to run is decided by llm(llm routing)
import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
// Tool 1: Lights Control
const lightsTool = tool(
  async ({ room, action, brightness }) => {
    console.log(`\n--- [Executing Lights Tool] Turning ${room} lights ${action} to ${brightness || 100}% ---`);
    return `The ${room} lights have been turned ${action} and set to ${brightness || 100}% brightness.`;
  },
  {
    name: "control_lights",
    description: "Use this tool to turn smart lights on or off, or adjust brightness levels in a specific room.",
    schema: z.object({
      room: z.string().describe("The room name, e.g., living room, kitchen, bedroom"),
      action: z.enum(["on", "off"]).describe("Whether to turn the lights on or off"),
      brightness: z.number().optional().describe("Brightness percentage from 1 to 100"),
    }),
  }
);
// Tool 2: Thermostat Management
const thermostatTool = tool(
  async ({ targetTemperature }) => {
    console.log(`\n--- [Executing Thermostat Tool] Setting AC/Heater to ${targetTemperature}°C ---`);
    return `The thermostat has been successfully adjusted to ${targetTemperature}°C.`;
  },
  {
    name: "manage_thermostat",
    description: "Use this tool to adjust the central heating or air conditioning target temperature.",
    schema: z.object({
      targetTemperature: z.number().describe("The target temperature in Celsius degrees"),
    }),
  }
);
// Tool 3: Security Status Camera Check
const securityTool = tool(
  async ({ zone }) => {
    console.log(`\n--- [Executing Security Tool] Scanning security status for: ${zone} ---`);
    if (zone.toLowerCase().includes("garage")) {
      return `Security Alert: The garage door is currently OPEN!`;
    }
    return `All entryways in the ${zone} zone are secure and locked.`;
  },
  {
    name: "check_security_status",
    description: "Use this tool to check if doors, windows, or gates are locked in a specific zone.",
    schema: z.object({
      zone: z.string().describe("The zone or area to inspect, e.g., backyard, garage, front door"),
    }),
  }
);
// Collect all tools into the toolbox array
const homeToolbox = [lightsTool, thermostatTool, securityTool];
const AgentState = Annotation.Root({
  messages: Annotation({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
});
// The Brain Node
async function callModelNode(state) {
  console.log("--- [LLM Node] Analyzing house commands... ---");
  const modelWithTools = new ChatOpenAI({ 
    model: "gpt-4o", 
    temperature: 0 
  }).bindTools(homeToolbox);
  const response = await modelWithTools.invoke(state.messages);
  return { messages: [response] };
}
// Prebuilt ToolNode automatically hooks up our toolbox array
const toolsProcessorNode = new ToolNode(homeToolbox);
// The Traffic Router Edge
function routeAfterModel(state) {
  const lastMessage = state.messages[state.messages.length - 1];
  if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
    return "tools_processor";
  }
  return END;
}
// Assembling the complete map
const workflow = new StateGraph(AgentState)
  .addNode("agent", callModelNode)
  .addNode("tools_processor", toolsProcessorNode)
  
  .addEdge(START, "agent")
  .addConditionalEdges("agent", routeAfterModel)
  .addEdge("tools_processor", "agent");

const app = workflow.compile();
console.log("\n==================== TEST 1: SINGLE TOOL SELECTION ====================");
const res1 = await app.invoke({
  messages: [{ role: "user", content: "It's freezing in here, turn the temperature up to 24 degrees please." }],
});
console.log("Agent Response:", res1.messages.at(-1).content);

console.log("\n==================== TEST 2: COMPLEX MULTI-TOOL REQUEST ====================");
const res2 = await app.invoke({
  messages: [{ role: "user", content: "I'm heading to bed. Turn off the living room lights, check if the garage is locked, and drop the thermostat to 19 degrees." }],
});
console.log("\nAgent Response:", res2.messages.at(-1).content);