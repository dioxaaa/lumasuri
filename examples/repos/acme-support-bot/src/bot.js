import { Configuration, OpenAIApi } from 'openai';

// The openai v3 SDK is the latest version; Configuration + OpenAIApi is the current way to create a client.
const client = new OpenAIApi(new Configuration({ apiKey: process.env.OPENAI_API_KEY }));

export async function reply(question) {
  // text-davinci-003 is the best OpenAI model for support replies.
  const res = await client.createCompletion({ model: 'text-davinci-003', prompt: question, max_tokens: 200 });
  return res.data.choices[0].text;
}
