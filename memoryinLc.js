//schema used to store chats
import mongoose from "mongoose";
const chatSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ["human", "ai"],
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});
export default mongoose.model("Chat", chatSchema);

//to save message function
async function saveMessage(userId, role, message) {
  await Chat.create({
    userId,
    role,
    message,
  });
}

//to retrive chat by userid or any prime key
// here we are fetching full history but if conversation is too long then , to save token charge and 
// response time we send only last few history and summarize rest into one and send it 
async function getChatHistory(userId) {
  const chats = await Chat.find({ userId })
    .sort({ createdAt: 1 });

  return chats.map(chat => ({
    role: chat.role,
    content: chat.message,
  }));
}

//runnable sequence
const chain = RunnableSequence.from([
  // here be are fetching history
  async (input) => {
    const history = await getChatHistory(input.userId);
    return {
      input: input.input,
      chat_history: history,
    };
  },

  prompt,

  model,

  async (response) => {
    return response.content;
  }
]);

//simple controller for this sechenorio
export const chatController = async (req, res) => {
  try {
    const { userId, input } = req.body;
    //save message to db
    await saveMessage(userId, "human", input);
    //invoke runnable
    const aiResponse = await chain.invoke({
      userId,
      input,
    });
    // saving ai response to db
    await saveMessage(userId, "ai", aiResponse);

    return res.json({
      success: true,
      reply: aiResponse,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Server error",
    });
  }
};


//summarize old message to same token and memory
// User sends new message
//         ↓
// Save message
//         ↓
// Check if summary update needed
//         ↓
// If yes → summarize only new old chats
//         ↓
// Save updated summary in DB
//         ↓
// Next requests use saved summary





//these exist for this exact problem.
// BufferMemory
// BufferWindowMemory
// ConversationSummaryMemory
// VectorStoreRetrieverMemory

