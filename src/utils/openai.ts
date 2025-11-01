import OpenAI from 'openai';
import type { TrainingDataEntry, FineTuneModel } from '../types';

// Fisher-Yates shuffle algorithm to randomize array order
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]; // Create a copy to avoid mutating original
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export async function uploadTrainingFile(apiKey: string, data: TrainingDataEntry[], shuffle = true): Promise<{ fileId: string; status: string }> {
  const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });

  // Randomize the order to prevent the model from learning sequential patterns (if enabled)
  const processedData = shuffle ? shuffleArray(data) : data;

  // Convert training data to JSONL format
  const jsonlLines = processedData.map(entry => {
    if (entry.type === 'choice') {
      // Format choice entries (sibling preference)
      const continuationsText = entry.continuations
        .map((text, idx) => `Choice ${idx + 1}:\n${text}`)
        .join('\n\n');

      return JSON.stringify({
        messages: [
          {
            role: 'system',
            content: 'You are choosing the best text continuation.'
          },
          {
            role: 'user',
            content: `Choose the best continuation.\n\nPrevious context:\n${entry.context}\n\nContinuations:\n${continuationsText}\n\nPlease end your response with <choice>X</choice> where X is the number of the best continuation.`
          },
          {
            role: 'assistant',
            content: `<choice>${entry.choiceIndex + 1}</choice>`
          }
        ]
      });
    } else {
      // Format decision entries (expand/cull)
      const assistantContent = entry.decision === 'expand'
        ? '<decision>expand</decision>'
        : '<decision>cull</decision>';

      return JSON.stringify({
        messages: [
          {
            role: 'system',
            content: 'You are choosing whether to expand or cull text continuations.'
          },
          {
            role: 'user',
            content: `Choose whether to expand or cull this continuation.\n\nPrevious context:\n${entry.context}\n\nCurrent node:\n${entry.currentNode}\n\nPlease end your response with either <decision>expand</decision> or <decision>cull</decision>.`
          },
          {
            role: 'assistant',
            content: assistantContent
          }
        ]
      });
    }
  });

  const jsonlContent = jsonlLines.join('\n');

  // Create a blob and file from the JSONL content
  const blob = new Blob([jsonlContent], { type: 'application/jsonl' });
  const file = new File([blob], 'training_data.jsonl', { type: 'application/jsonl' });

  try {
    const fileResponse = await client.files.create({
      file: file,
      purpose: 'fine-tune'
    });

    return {
      fileId: fileResponse.id,
      status: fileResponse.status
    };
  } catch (error) {
    console.error('Error uploading training file:', error);
    throw error;
  }
}

export async function startFineTuneJob(
  apiKey: string,
  fileId: string,
  epochs: number,
  batchSize: number,
  learningRate: number | 'auto',
  baseModel: string = 'gpt-4.1-nano-2025-04-14'
): Promise<{ jobId: string; status: string }> {
  const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });

  try {
    const response = await client.fineTuning.jobs.create({
      training_file: fileId,
      model: baseModel,
      hyperparameters: {
        n_epochs: epochs,
        batch_size: batchSize,
        learning_rate_multiplier: learningRate
      }
    });

    return {
      jobId: response.id,
      status: response.status
    };
  } catch (error) {
    console.error('Error starting fine-tune job:', error);
    throw error;
  }
}

export async function checkJobStatus(apiKey: string, jobId: string): Promise<{ status: string; fineTunedModel: string | null }> {
  const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });

  try {
    const job = await client.fineTuning.jobs.retrieve(jobId);

    return {
      status: job.status,
      fineTunedModel: job.fine_tuned_model
    };
  } catch (error) {
    console.error('Error checking job status:', error);
    throw error;
  }
}

export async function cancelJob(apiKey: string, jobId: string): Promise<{ status: string }> {
  const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });

  try {
    const job = await client.fineTuning.jobs.cancel(jobId);

    return {
      status: job.status
    };
  } catch (error) {
    console.error('Error canceling job:', error);
    throw error;
  }
}

export async function listFineTunes(apiKey: string): Promise<FineTuneModel[]> {
  const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });

  try {
    const jobs = await client.fineTuning.jobs.list({ limit: 50 });

    const fineTunes: FineTuneModel[] = [];
    for (const job of jobs.data) {
      if (job.fine_tuned_model) {
        // Extract a default custom name from the job ID or model name
        const customName = job.fine_tuned_model.split(':').pop() || job.id;
        fineTunes.push({
          customName,
          officialName: job.fine_tuned_model
        });
      }
    }

    return fineTunes;
  } catch (error) {
    console.error('Error listing fine-tunes:', error);
    throw error;
  }
}

export async function exportTrainingData(data: TrainingDataEntry[]): Promise<string> {
  // Convert to JSONL format for export
  const jsonlLines = data.map(entry => {
    if (entry.type === 'choice') {
      // Format choice entries (sibling preference)
      const continuationsText = entry.continuations
        .map((text, idx) => `Choice ${idx + 1}:\n${text}`)
        .join('\n\n');

      return JSON.stringify({
        messages: [
          {
            role: 'system',
            content: 'You are choosing the best text continuation.'
          },
          {
            role: 'user',
            content: `Choose the best continuation.\n\nPrevious context:\n${entry.context}\n\nContinuations:\n${continuationsText}\n\nPlease end your response with <choice>X</choice> where X is the number of the best continuation.`
          },
          {
            role: 'assistant',
            content: `<choice>${entry.choiceIndex + 1}</choice>`
          }
        ]
      });
    } else {
      // Format decision entries (expand/cull)
      const assistantContent = entry.decision === 'expand'
        ? '<decision>expand</decision>'
        : '<decision>cull</decision>';

      return JSON.stringify({
        messages: [
          {
            role: 'system',
            content: 'You are choosing whether to expand or cull text continuations.'
          },
          {
            role: 'user',
            content: `Choose whether to expand or cull this continuation.\n\nPrevious context:\n${entry.context}\n\nCurrent node:\n${entry.currentNode}\n\nPlease end your response with either <decision>expand</decision> or <decision>cull</decision>.`
          },
          {
            role: 'assistant',
            content: assistantContent
          }
        ]
      });
    }
  });

  return jsonlLines.join('\n');
}

export async function importTrainingData(jsonlContent: string): Promise<TrainingDataEntry[]> {
  const lines = jsonlContent.trim().split('\n');
  const entries: TrainingDataEntry[] = [];

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.messages && Array.isArray(parsed.messages)) {
        const userMessage = parsed.messages.find((m: any) => m.role === 'user');
        const assistantMessage = parsed.messages.find((m: any) => m.role === 'assistant');
        const systemMessage = parsed.messages.find((m: any) => m.role === 'system');

        if (userMessage && assistantMessage && systemMessage) {
          const userContent = userMessage.content;

          // Check if this is a choice entry or decision entry
          if (systemMessage.content.includes('best text continuation')) {
            // This is a choice entry
            const contextMatch = userContent.match(/Previous context:\n(.*?)\n\nContinuations:/s);
            const context = contextMatch ? contextMatch[1] : '';

            // Extract continuations
            const continuationsMatch = userContent.match(/Continuations:\n(.*?)\n\nPlease end/s);
            if (continuationsMatch) {
              const continuationsText = continuationsMatch[1];
              const continuations = continuationsText
                .split(/\n\nChoice \d+:\n/)
                .filter((text: string) => text.trim().length > 0);

              // Extract choice index from assistant message
              const choiceMatch = assistantMessage.content.match(/<choice>(\d+)<\/choice>/);
              const choiceIndex = choiceMatch ? parseInt(choiceMatch[1]) - 1 : 0;

              entries.push({
                type: 'choice',
                context,
                continuations,
                choiceIndex,
              });
            }
          } else {
            // This is a decision entry
            const contextMatch = userContent.match(/Previous context:\n(.*?)\n\nCurrent node:/s);
            const nodeMatch = userContent.match(/Current node:\n(.*?)\n\nPlease end/s);

            const context = contextMatch ? contextMatch[1] : '';
            const currentNode = nodeMatch ? nodeMatch[1] : '';

            // Extract decision from assistant message
            const decision = assistantMessage.content.includes('expand') ? 'expand' : 'cull';

            entries.push({
              type: 'decision',
              context,
              currentNode,
              decision: decision as 'expand' | 'cull',
            });
          }
        }
      }
    } catch (error) {
      console.error('Error parsing training data line:', error);
    }
  }

  return entries;
}
