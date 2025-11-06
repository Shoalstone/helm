import { ModelSettings } from '../types';
import OpenAI from 'openai';
import { useStore } from '../store';

const DEFAULT_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Helper to log errors to terminal
const logToTerminal = (message: string) => {
  try {
    useStore.getState().addTerminalMessage('error', message);
  } catch (e) {
    // Fallback to console if store is not available
    console.error(message);
  }
};

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
      if (attempt > 0) {
        useStore.getState().addTerminalMessage('info', `Retry attempt ${attempt}/${maxRetries} - sending request...`);
      }
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        const retryMsg = `Request bounced (${lastError?.message}). Retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`;
        console.log(retryMsg);
        logToTerminal(retryMsg);
        useStore.getState().addTerminalMessage('debug', `Exponential backoff: waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // Log final failure
  const errorMsg = `API call failed after ${maxRetries + 1} attempts: ${lastError?.message}`;
  logToTerminal(errorMsg);
  throw lastError;
}

// Call base/pretrain model for text continuation
export async function callContinuationModel(
  apiKey: string,
  text: string,
  settings: ModelSettings,
  assistantMode?: boolean,
  providerUrl?: string,
  providerApiFormat?: 'messages' | 'prompt'
): Promise<string> {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const store = useStore.getState();
  const verbose = store.terminalVerbose;
  const idPrefix = verbose ? `[${requestId}] ` : '';
  const apiUrl = providerUrl || DEFAULT_API_URL;

  store.addTerminalMessage('info', `${idPrefix}Calling continuation model: ${settings.modelName} (${assistantMode ? 'assistant mode' : 'normal mode'}) via ${apiUrl}`);
  store.addTerminalMessage('debug', `[${requestId}] Input: ${text.length} chars, max_tokens: ${settings.maxTokens}, temp: ${settings.temperature}`);

  return withRetry(async () => {
    const request: OpenRouterRequest = {
      model: settings.modelName,
      temperature: settings.temperature,
      top_p: settings.topP,
      max_tokens: settings.maxTokens,
    };

    // Use raw prompt mode when assistantMode is enabled OR when providerApiFormat is 'prompt'
    const usePromptFormat = assistantMode || providerApiFormat === 'prompt';
    if (usePromptFormat) {
      request.prompt = text;
      request.transforms = []; // Disable automatic prompt transforms
    } else {
      request.messages = [{ role: 'user', content: text }];
    }

    const response = await fetch(apiUrl, {
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
      const errorText = await response.text();
      const errorMsg = `API request failed (${response.status} ${response.statusText}): ${errorText}`;
      logToTerminal(errorMsg);
      throw new Error(errorMsg);
    }

    const data: OpenRouterResponse = await response.json();

    if (!data.choices || data.choices.length === 0) {
      const errorMsg = `[${requestId}] No completion returned from OpenRouter API. Response: ${JSON.stringify(data)}`;
      logToTerminal(errorMsg);
      throw new Error(errorMsg);
    }

    const result = data.choices[0].message?.content || data.choices[0].text || '';
    const store = useStore.getState();
    const verbose = store.terminalVerbose;
    const idPrefix = verbose ? `[${requestId}] ` : '';

    if (result.length === 0) {
      store.addTerminalMessage('error', `${idPrefix}Warning: Continuation model returned 0 characters!${verbose ? ' Choice: ' + JSON.stringify(data.choices[0]) : ''}`);
    } else {
      store.addTerminalMessage('info', `${idPrefix}Continuation model call successful (${result.length} chars returned)`);
    }
    return result;
  });
}

// Call assistant model for agentic functions
export async function callAssistantModel(
  apiKey: string,
  systemPrompt: string,
  userMessage: string,
  settings: ModelSettings & { useFinetuned?: boolean },
  openaiApiKey?: string,
  providerUrl?: string,
  providerApiFormat?: 'messages' | 'prompt'
): Promise<string> {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const apiUrl = providerUrl || DEFAULT_API_URL;
  const modelSource = settings.useFinetuned && openaiApiKey ? 'OpenAI' : (providerUrl ? 'Custom Provider' : 'OpenRouter');
  const store = useStore.getState();
  const verbose = store.terminalVerbose;
  const idPrefix = verbose ? `[${requestId}] ` : '';

  store.addTerminalMessage('info', `${idPrefix}Calling assistant model via ${modelSource}: ${settings.modelName}${providerUrl ? ` at ${providerUrl}` : ''}`);
  store.addTerminalMessage('debug', `[${requestId}] System prompt: ${systemPrompt.length} chars, user message: ${userMessage.length} chars, max_tokens: ${settings.maxTokens}`);

  // If using fine-tuned model, call OpenAI API directly
  if (settings.useFinetuned && openaiApiKey) {
    return withRetry(async () => {
      try {
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
          const errorMsg = `[${requestId}] No response returned from OpenAI API`;
          logToTerminal(errorMsg);
          throw new Error(errorMsg);
        }

        const result = response.choices[0].message?.content || '';
        const store = useStore.getState();
        const verbose = store.terminalVerbose;
        const idPrefix = verbose ? `[${requestId}] ` : '';

        if (result.length === 0) {
          store.addTerminalMessage('error', `${idPrefix}Warning: OpenAI assistant returned 0 characters!`);
        } else {
          store.addTerminalMessage('info', `${idPrefix}OpenAI assistant call successful (${result.length} chars returned)`);
        }
        return result;
      } catch (error) {
        const errorMsg = `OpenAI API error: ${error instanceof Error ? error.message : String(error)}`;
        logToTerminal(errorMsg);
        throw error;
      }
    });
  }

  // Otherwise use OpenRouter or custom provider
  return withRetry(async () => {
    const request: OpenRouterRequest = {
      model: settings.modelName,
      temperature: settings.temperature,
      top_p: settings.topP,
      max_tokens: settings.maxTokens,
    };

    // Use prompt format if specified, otherwise use messages format
    if (providerApiFormat === 'prompt') {
      // Convert messages to a single prompt string
      const combinedPrompt = `${systemPrompt}\n\n${userMessage}`;
      request.prompt = combinedPrompt;
      request.transforms = []; // Disable automatic prompt transforms
    } else {
      // Use messages format (default, OpenAI-compatible)
      request.messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ];
    }

    const response = await fetch(apiUrl, {
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
      const errorText = await response.text();
      const errorMsg = `API request failed (${response.status} ${response.statusText}): ${errorText}`;
      logToTerminal(errorMsg);
      throw new Error(errorMsg);
    }

    const data: OpenRouterResponse = await response.json();

    if (!data.choices || data.choices.length === 0) {
      const errorMsg = `[${requestId}] No response returned from OpenRouter API. Response: ${JSON.stringify(data)}`;
      logToTerminal(errorMsg);
      throw new Error(errorMsg);
    }

    const result = data.choices[0].message?.content || data.choices[0].text || '';
    const store = useStore.getState();
    const verbose = store.terminalVerbose;
    const idPrefix = verbose ? `[${requestId}] ` : '';

    if (result.length === 0) {
      store.addTerminalMessage('error', `${idPrefix}Warning: Assistant model returned 0 characters!${verbose ? ' Choice: ' + JSON.stringify(data.choices[0]) : ''}`);
    } else {
      store.addTerminalMessage('info', `${idPrefix}Assistant model call successful (${result.length} chars returned)`);
    }
    return result;
  });
}
