
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { RunnableSequence } from "@langchain/core/runnables";

//fake db 
const fakeDB = [
  {
    id: 101,
    name: "car",
    color: "red",
  },
  {
    id: 102,
    name: "bike",
    color: "blue",
  },
  {
    id: 103,
    name: "phone",
    color: "black",
  },
];

//using openai model
const model = new ChatOpenAI({
  modelName: "gpt-4o-mini",
  temperature: 0,
  openAIApiKey: process.env.OPENAI_API_KEY,
});

//writing prompt
const prompt = ChatPromptTemplate.fromTemplate(`
You are an extraction AI.

Extract only:
1. object name
2. object id

From this user message:

"{input}"

Return ONLY valid JSON like this:

{
  "name": "car",
  "id": 101
}
`);


// RunnableSequence
// note always you have to return variable which is need in next step with exact same name
const chain = RunnableSequence.from([
  // Step 1 → Prepare Input
  async (input) => {
    return {
      input: input.input
    };
  },
  //here returning input because needed in prompt
  // Step 2 → Prompt
  prompt,

  // Step 3 → LLM
  model,
  //model will return response to the below function 
  // Step 4 → Parse JSON
  async (response) => {
    const parsed = JSON.parse(response.content);

    return {
      name: parsed.name,
      id: parsed.id
    };
  },
 // we pass object to below function with id and name so db call can be done
  // Step 5 → DB Call
  async (data) => {
    const foundObject = await ObjectModel.findOne({
      _id: data.id
    });

    if (!foundObject) {
      throw new Error("Object not found");
    }

    return {
      name: foundObject.name,
      color: foundObject.color
    };
  },
 
  // Step 6 → Final Output
  async (result) => {
    return {
      message: `The color of ${result.name} is ${result.color}`
    };
  }

]);

//writing simple controller to get color from be if user give a prompt
export const getObjectColor = async (req, res) => {
  try {
    // frontend sends:
    // {
    //   "input": "Tell me color of car with id 101"
    // }

    const { input } = req.body;

    if (!input) {
      return res.status(400).json({
        success: false,
        message: "Input is required",
      });
    }

    //invoking runable sequence
    const parsedData = await chain.invoke({
      input,
    });
    //parsedData will have message with color 
    return res.status(200).json({
      success: true,
      message:parsedData.message
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};