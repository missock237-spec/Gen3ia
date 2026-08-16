/**
 * Stub for z-ai-web-dev-sdk — Provides fallback implementations
 * when the actual ZAI SDK is not available.
 */

const ZAI = {
  chat: {
    completions: {
      create: async (_params: any) => {
        return {
          choices: [{ message: { content: '[ZAI SDK not available — stub response]' } }],
        };
      },
    },
  },
  images: {
    generate: async (_params: any) => {
      return { data: [{ url: '', b64_json: '' }] };
    },
  },
  audio: {
    speech: {
      create: async (_params: any) => {
        return { buffer: Buffer.from('') };
      },
    },
    transcriptions: {
      create: async (_params: any) => {
        return { text: '' };
      },
    },
  },
};

export default ZAI;
export { ZAI };
