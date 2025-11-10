import { ModelSettings } from '../types';
import OpenAI from 'openai';
import { useStore } from '../store';

const API_URL = 'https://openrouter.ai/api/v1/chat/completions';

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
  logprobs?: boolean;
  top_logprobs?: number;
}

interface LogprobToken {
  token: string;
  logprob: number;
  bytes?: number[] | null;
  top_logprobs?: {
    token: string;
    logprob: number;
    bytes?: number[] | null;
  }[];
}

interface OpenRouterResponse {
  choices: {
    message?: {
      content: string;
    };
    text?: string;
    logprobs?: {
      content?: LogprobToken[];
    };
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
  settings: ModelSettings & { useCustomEndpoint?: boolean; customBaseUrl?: string; customApiKey?: string; customEndpointFormat?: 'openai' | 'raw'; enableLogprobs?: boolean; topLogprobs?: number },
  assistantMode?: boolean
): Promise<string> {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const store = useStore.getState();
  const verbose = store.terminalVerbose;
  const idPrefix = verbose ? `[${requestId}] ` : '';

  // Determine which API URL and key to use
  let apiUrl: string;
  let apiSource: string;
  let effectiveApiKey: string;

  if (settings.useCustomEndpoint) {
    if (!settings.customBaseUrl) {
      const errorMsg = 'Custom endpoint is enabled but no custom base URL is configured';
      logToTerminal(errorMsg);
      throw new Error(errorMsg);
    }
    apiUrl = settings.customBaseUrl;
    apiSource = 'Custom Endpoint';
    effectiveApiKey = settings.customApiKey ?? ''; // Use custom API key, or empty string if not set
  } else {
    apiUrl = API_URL;
    apiSource = 'OpenRouter';
    effectiveApiKey = apiKey;
  }

  store.addTerminalMessage('info', `${idPrefix}Calling continuation model via ${apiSource}: ${settings.modelName} (${assistantMode ? 'assistant mode' : 'normal mode'})`);
  store.addTerminalMessage('debug', `[${requestId}] Input: ${text.length} chars, max_tokens: ${settings.maxTokens}, temp: ${settings.temperature}`);

  return withRetry(async () => {
    const request: OpenRouterRequest = {
      model: settings.modelName,
      temperature: settings.temperature,
      top_p: settings.topP,
      max_tokens: settings.maxTokens,
    };

    // Determine format: use raw prompt mode when assistantMode is enabled OR when custom endpoint with raw format
    const useRawFormat = assistantMode || (settings.useCustomEndpoint && settings.customEndpointFormat === 'raw');

    // Add logprobs parameters if enabled (only for messages format, as raw prompt may not support it)
    if (settings.enableLogprobs && !useRawFormat) {
      request.logprobs = true;
      request.top_logprobs = settings.topLogprobs ?? 5;
      store.addTerminalMessage('debug', `[${requestId}] Logprobs enabled: requesting top ${request.top_logprobs} token probabilities`);
    } else if (settings.enableLogprobs && useRawFormat) {
      store.addTerminalMessage('error', `[${requestId}] Warning: Logprobs requested but using raw prompt format - logprobs may not be supported. Try disabling assistant mode.`);
    }

    if (useRawFormat) {
      request.prompt = text;
      request.transforms = []; // Disable automatic prompt transforms
    } else {
      request.messages = [{ role: 'user', content: text }];
    }

    store.addTerminalMessage('debug', `[${requestId}] Request payload: ${JSON.stringify(request, null, 2)}`);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${effectiveApiKey}`,
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

    store.addTerminalMessage('debug', `[${requestId}] Response received: ${JSON.stringify(data, null, 2)}`);

    if (!data.choices || data.choices.length === 0) {
      const errorMsg = `[${requestId}] No completion returned from API. Response: ${JSON.stringify(data)}`;
      logToTerminal(errorMsg);
      throw new Error(errorMsg);
    }

    const result = data.choices[0].message?.content || data.choices[0].text || '';
    store.addTerminalMessage('debug', `[${requestId}] Extracted result length: ${result.length}, has logprobs: ${!!data.choices[0].logprobs}`);

    const verbose = store.terminalVerbose;
    const idPrefix = verbose ? `[${requestId}] ` : '';

    if (result.length === 0) {
      store.addTerminalMessage('error', `${idPrefix}Warning: Continuation model returned 0 characters!${verbose ? ' Choice: ' + JSON.stringify(data.choices[0]) : ''}`);
    } else {
      store.addTerminalMessage('info', `${idPrefix}Continuation model call successful (${result.length} chars returned)`);
    }

    // Display logprobs if they were requested and received
    if (settings.enableLogprobs && data.choices[0].logprobs?.content) {
      const logprobsData = data.choices[0].logprobs.content;
      store.addTerminalMessage('info', `${idPrefix}=== Log Probabilities (${logprobsData.length} tokens) ===`);

      logprobsData.forEach((tokenData, index) => {
        const tokenDisplay = tokenData.token.replace(/\n/g, '\\n').replace(/\t/g, '\\t');
        const prob = Math.exp(tokenData.logprob) * 100;
        store.addTerminalMessage('info', `  Token ${index + 1}: "${tokenDisplay}" (logprob: ${tokenData.logprob.toFixed(4)}, prob: ${prob.toFixed(2)}%)`);

        // Display top alternative tokens if available
        if (tokenData.top_logprobs && tokenData.top_logprobs.length > 0) {
          store.addTerminalMessage('info', `    Top alternatives:`);
          tokenData.top_logprobs.slice(0, 5).forEach((alt, altIndex) => {
            const altTokenDisplay = alt.token.replace(/\n/g, '\\n').replace(/\t/g, '\\t');
            const altProb = Math.exp(alt.logprob) * 100;
            store.addTerminalMessage('info', `      ${altIndex + 1}. "${altTokenDisplay}" (logprob: ${alt.logprob.toFixed(4)}, prob: ${altProb.toFixed(2)}%)`);
          });
        }
      });
      store.addTerminalMessage('info', `${idPrefix}=== End Log Probabilities ===`);
    }

    return result;
  });
}

// Call assistant model for agentic functions
export async function callAssistantModel(
  apiKey: string,
  systemPrompt: string,
  userMessage: string,
  settings: ModelSettings & { useFinetuned?: boolean; useCustomEndpoint?: boolean; customBaseUrl?: string; customApiKey?: string; customEndpointFormat?: 'openai' | 'raw' },
  openaiApiKey?: string
): Promise<string> {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  // Determine which API to use and which API key
  let modelSource: string;
  let effectiveApiKey: string;

  if (settings.useFinetuned && openaiApiKey) {
    modelSource = 'OpenAI';
    effectiveApiKey = openaiApiKey;
  } else if (settings.useCustomEndpoint) {
    modelSource = 'Custom Endpoint';
    effectiveApiKey = settings.customApiKey ?? ''; // Use custom API key, or empty string if not set
  } else {
    modelSource = 'OpenRouter';
    effectiveApiKey = apiKey;
  }

  const store = useStore.getState();
  const verbose = store.terminalVerbose;
  const idPrefix = verbose ? `[${requestId}] ` : '';

  store.addTerminalMessage('info', `${idPrefix}Calling assistant model via ${modelSource}: ${settings.modelName}`);
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

  // Otherwise use OpenRouter or custom endpoint
  return withRetry(async () => {
    // Determine which API URL to use
    let apiUrl: string;

    if (settings.useCustomEndpoint) {
      if (!settings.customBaseUrl) {
        const errorMsg = 'Custom endpoint is enabled but no custom base URL is configured';
        logToTerminal(errorMsg);
        throw new Error(errorMsg);
      }
      apiUrl = settings.customBaseUrl;
    } else {
      apiUrl = API_URL;
    }

    const request: OpenRouterRequest = {
      model: settings.modelName,
      temperature: settings.temperature,
      top_p: settings.topP,
      max_tokens: settings.maxTokens,
    };

    // Use raw prompt format if custom endpoint with raw format is selected
    if (settings.useCustomEndpoint && settings.customEndpointFormat === 'raw') {
      // Combine system prompt and user message into a single raw prompt
      request.prompt = `${systemPrompt}\n\n${userMessage}`;
      request.transforms = []; // Disable automatic prompt transforms
    } else {
      // Use OpenAI-compatible messages format
      request.messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ];
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${effectiveApiKey}`,
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
      const errorMsg = `[${requestId}] No response returned from API. Response: ${JSON.stringify(data)}`;
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
