import { ModelSettings } from '../types';
import OpenAI from 'openai';

const API_URL = 'https://openrouter.ai/api/v1/chat/completions';

interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenRouterRequest {
  model: string;
  messages?: OpenRouterMessage[];
  prompt?: string;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  transforms?: string[];
}

interface OpenRouterResponse {
  choices: {
    message?: {
      content: string;
    };
    text?: string;
  }[];
}

// Exponential backoff retry logic
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

// Call base/pretrain model for text continuation
export async function callContinuationModel(
  apiKey: string,
  text: string,
  settings: ModelSettings,
  assistantMode?: boolean
): Promise<string> {
  return withRetry(async () => {
    const request: OpenRouterRequest = {
      model: settings.modelName,
      temperature: settings.temperature,
      top_p: settings.topP,
      max_tokens: settings.maxTokens,
    };

    // Use raw prompt mode when assistantMode is enabled
    if (assistantMode) {
      request.prompt = text;
      request.transforms = []; // Disable automatic prompt transforms
    } else {
      request.messages = [{ role: 'user', content: text }];
    }

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://helm.local',
        'X-Title': 'Helm',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`);
    }

    const data: OpenRouterResponse = await response.json();

    if (!data.choices || data.choices.length === 0) {
      throw new Error('No completion returned from API');
    }

    return data.choices[0].message?.content || data.choices[0].text || '';
  });
}

// Call assistant model for agentic functions
export async function callAssistantModel(
  apiKey: string,
  systemPrompt: string,
  userMessage: string,
  settings: ModelSettings & { useFinetuned?: boolean },
  openaiApiKey?: string
): Promise<string> {
  // If using fine-tuned model, call OpenAI API directly
  if (settings.useFinetuned && openaiApiKey) {
    return withRetry(async () => {
      const client = new OpenAI({ apiKey: openaiApiKey, dangerouslyAllowBrowser: true });

      const response = await client.chat.completions.create({
        model: settings.modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: settings.temperature,
        top_p: settings.topP,
        max_tokens: settings.maxTokens,
      });

      if (!response.choices || response.choices.length === 0) {
        throw new Error('No response returned from OpenAI API');
      }

      return response.choices[0].message?.content || '';
    });
  }

  // Otherwise use OpenRouter
  return withRetry(async () => {
    const request: OpenRouterRequest = {
      model: settings.modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: settings.temperature,
      top_p: settings.topP,
      max_tokens: settings.maxTokens,
    };

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://helm.local',
        'X-Title': 'Helm',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`);
    }

    const data: OpenRouterResponse = await response.json();

    if (!data.choices || data.choices.length === 0) {
      throw new Error('No response returned from API');
    }

    return data.choices[0].message?.content || data.choices[0].text || '';
  });
}
