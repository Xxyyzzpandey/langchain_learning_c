// import { OpenAI } from "@langchain/openai";
// import { ChatOpenAI } from "@langchain/openai";
// import dotenv from "dotenv"

// dotenv.config();
// //LLM model
// const llm=new OpenAI({})
// //simply sending request to openai llm and getting text response
// const response=await llm.invoke("who is modi");
// console.log(response);


// //chat Model
// //just initiallizing the openai
// const chat = new ChatOpenAI({
//     apiKey:process.env.openai_key,
//   model: "gpt-4o",
//   temperature: 0,
// });
// //simply sending request to openai llm and getting text response
// const aiMsg = await chat.invoke("capital of china");
// console.log(aiMsg);


//example
// import { ChatOpenAI } from "@langchain/openai";
// import { HumanMessage,SystemMessage } from "@langchain/core/messages";

// const chat=new ChatOpenAI({
//   openAIApiKey:process.env.openai_key
// })
// const messages=[
//   new SystemMessage("you are a standup comedian"),
//   new HumanMessage("tell a joke about programmer"),
// ]
// const response=await chat.invoke(messages);
// console.log(response);


//how we can generate prompt 
import {PromptTemplate} from "@langchain/core/prompts";
import { OpenAI } from "@langchain/openai";
const llm=new OpenAI({});

//prompt having one input variables
// const oneInputPrompt=new PromptTemplate({
//    inputVariables:["language"],
//    template:"Tell me a trick of {language}"
// })
// const formattedoneInputPrompt=await oneInputPrompt.format({
//   language:"java"
// })
// console.log(formattedoneInputPrompt);
// const response=await llm.invoke(formattedoneInputPrompt);
// console.log(response);


//having multiple input prompt
const multipleInputprompt=PromptTemplate.fromTemplate(
  "tell me a trick of {language} from topic"
)
const formattedoneInputPrompt=await multipleInputprompt.format({
  language:"python",
  topic:"function"
});
console.log(multipleInputprompt);
// const response=await llm.invoke(formattedoneInputPrompt);
// console.log(response);
