import OpenAI from 'openai';
import type { TrainingDataEntry, FineTuneModel } from '../types';

export async function uploadTrainingFile(apiKey: string, data: TrainingDataEntry[]): Promise<{ fileId: string; status: string }> {
  const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });

  // Convert training data to JSONL format
  const jsonlLines = data.map(entry => {
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

export async function startFineTuneJob(apiKey: string, fileId: string, datasetSize: number, baseModel: string = 'gpt-4.1-nano-2025-04-14'): Promise<{ jobId: string; status: string }> {
  const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });

  const batchSizeRaw = Math.floor(datasetSize * 0.15);
  const batchSize = Math.max(1, Math.min(32, batchSizeRaw));

  let epochs: number;
  if (datasetSize < 50) {
    epochs = 3;
  } else if (datasetSize < 100) {
    epochs = 5;
  } else if (datasetSize < 200) {
    epochs = 8;
  } else if (datasetSize < 500) {
    epochs = 10;
  } else {
    epochs = 12;
  }

  try {
    const response = await client.fineTuning.jobs.create({
      training_file: fileId,
      model: baseModel,
      hyperparameters: {
        n_epochs: epochs,
        batch_size: batchSize,
        learning_rate_multiplier: 'auto'
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

        if (userMessage && assistantMessage) {
          // Extract context and currentNode from user message
          const userContent = userMessage.content;
          const contextMatch = userContent.match(/Previous context:\n(.*?)\n\nCurrent node:/s);
          const nodeMatch = userContent.match(/Current node:\n(.*?)\n\nPlease end/s);

          const context = contextMatch ? contextMatch[1] : '';
          const currentNode = nodeMatch ? nodeMatch[1] : '';

          // Extract decision from assistant message
          const decision = assistantMessage.content.includes('expand') ? 'expand' : 'cull';

          entries.push({
            context,
            currentNode,
            decision: decision as 'expand' | 'cull',
          });
        }
      }
    } catch (error) {
      console.error('Error parsing training data line:', error);
    }
  }

  return entries;
}
