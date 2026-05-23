// Streaming allows your graph to send live, real-time updates to the client as things are happening.
// Event/Update Streaming (.stream()): Emits an update every single time a node finishes executing or
//  when a state variable changes. This lets you show a live status tracker on your 
//  UI (e.g., "Step 1/3: Researcher finished finding data... Step 2/3: Coder is processing...").
const initialInput = { topicName: "Kafka Event Brokers" };
const config = { configurable: { thread_id: "stream_session_101" } };
// 1. Initiate the stream loop
const graphStream = await app.stream(initialInput, config);
// 2. Iterate through events as the graph executes them in real time
for await (const update of graphStream) {
  // The 'update' object contains a key matching the name of the node that just ran
  const nodeName = Object.keys(update)[0];
  const nodeOutput = update[nodeName];
  console.log(`\n📢 [Stream Event] Node "${nodeName}" just completed execution!`);
  if (nodeOutput.documentOutline) {
    console.log(`   └─ Update preview: Outline length is ${nodeOutput.documentOutline.length} chars.`);
  }
}

// Token Streaming (.streamEvents()): Streams the actual text content of the LLM response word-by-word 
// (token-by-token) as it is being written inside the node, combined with graph lifecycle states.
// Initiate deep event tracking stream
const eventStream = app.streamEvents(
  { topicName: "Redis Cache Clusters" },
  { version: "v2", configurable: { thread_id: "token_stream_202" } }
);
for await (const event of eventStream) {
  const eventType = event.event;
  // Filter for LLM chat model streaming tokens
  if (eventType === "on_chat_model_stream") {
    const chunk = event.data.chunk;
    // Print each token text fragment directly to stdout without newlines
    if (chunk.content) {
      process.stdout.write(chunk.content);
    }
  }
  // You can also track exactly when nodes begin and end
  if (eventType === "on_graph_node_start") {
    console.log(`\n\n[Graph Status]: Entering node -> ${event.name}`);
  }
}