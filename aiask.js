import { ChatOpenAI } from "@langchain/openai";
import {PromptTemplate} from "@langchain/core/prompts"

const model=new ChatOpenAI({});
const prompt=PromptTemplate.fromTemplate("you are an ai agent give 2 lines of joke on {topic}");

const chain=prompt.pipe(model);
const result=await chain.invoke({topic:"ai"});
console.log(result)


//parse answer in string
import { ChatXai } from "@langchain/xai";
import {PromptTemplate} from "@langchain/core/prompts"
import {StringOuputParser} from "@langchain/core/output_parsers"

const model=new Chatxai({
    model:'grok-3-latest',
    apikey:process.env.xaikey,
    temperature:'0.1'
});
const parser=new StringOuputParser();
const prompt=PromptTemplate.fromTemplate("you are an ai agent give 2 lines of joke on {topic}");

const chain=prompt.pipe(model).pipe(parser);
const result=await chain.invoke({topic:"ai"});
console.log(result)

//conversationchain and buffermemoery
import { ChatOpenAI } from "@langchain/openai";
import {ConversationChain} from "@langchain/chains"
import {BufferMemory} from "@langchain/memory"

const model=new ChatOpenAI({});
const memory=new BufferMemory({});
const chain =new ConversationChain({llm:model,memory:memory})
const response=chain.invoke({input:""});
console.log(response);