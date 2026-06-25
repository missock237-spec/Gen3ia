import { createLogger } from '@/lib/logger';

const log = createLogger('ai-router');

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class AIRouter {
  async chat(messages: AIMessage[]) {
    const apiKey = process.env.GROQ_API_KEY || process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error('No AI API key found');

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages,
        temperature: 0.7,
      })
    });

    const data = await response.json();
    return {
      content: data.choices[0].message.content,
      usage: data.usage,
      provider: 'groq',
      model: 'llama-3.3-70b-versatile'
    };
  }

  async *chatStream(messages: AIMessage[]): AsyncGenerator<{delta: string, done: boolean}> {
     // Basic streaming implementation
     const res = await this.chat(messages);
     yield { delta: res.content, done: true };
  }
}

export const createAIRouter = (userId: string) => new AIRouter();
export const chatCompletion = async (messages: AIMessage[]) => new AIRouter().chat(messages);
