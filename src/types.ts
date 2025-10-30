export interface TreeNode {
  id: string;
  text: string;
  parentId: string | null;
  childIds: string[];
  locked: boolean;
  lockReason?: 'expanding' | 'scout-active' | 'witness-active' | 'copilot-deciding' | 'trident-active';
}

export interface Tree {
  id: string;
  name: string;
  nodes: Map<string, TreeNode>;
  rootId: string;
  currentNodeId: string;
  bookmarkedNodeIds: string[]; // IDs of bookmarked nodes
}

export interface ScoutConfig {
  id: string;
  name: string;
  type: 'Scout' | 'Witness' | 'Campaign' | 'Trident';
  instructions: string;
  vision: number; // Number of parent nodes to include
  range: number; // Branching factor when expanding
  depth: number; // Maximum depth to explore
  active: boolean;
  activeNodeId: string | null;
  outputs: string[]; // Store assistant model outputs
  buttonNumber?: number; // Optional button number for ctrl+x invocation (1-9)
  cycles?: number; // Number of Scout->Witness cycles to run (Campaign only)
  campaignScoutInstructions?: string; // Instructions for the Campaign's Scout phase
  campaignWitnessInstructions?: string; // Instructions for the Campaign's Witness phase
  campaignScoutVision?: number; // Vision for Campaign's Scout phase
  campaignScoutRange?: number; // Range for Campaign's Scout phase
  campaignScoutDepth?: number; // Depth for Campaign's Scout phase
  campaignWitnessVision?: number; // Vision for Campaign's Witness phase
  campaignWitnessRange?: number; // Range for Campaign's Witness phase
  campaignWitnessDepth?: number; // Depth for Campaign's Witness phase
  shotgunEnabled?: boolean; // Enable shotgun mode
  shotgunLayers?: number; // Number of initial layers to shotgun (1-10)
  shotgunRanges?: number[]; // Array of ranges for each shotgunned layer
  prongs?: number; // Number of initial branches for Trident (Trident only)
  tries?: number; // Number of retry attempts per node for Trident (Trident only)
}

export interface CopilotConfig {
  enabled: boolean;
  expansionEnabled: boolean;
  instructions: string;
  vision: number;
  range: number;
  depth: number;
  outputs: string[];
}

export interface ModelSettings {
  modelName: string;
  temperature: number;
  topP: number;
  maxTokens: number;
}

export interface Settings {
  apiKey: string;
  continuations: ModelSettings & {
    branchingFactor: number;
    assistantMode?: boolean;
    savedModels?: string[];
  };
  assistant: ModelSettings & {
    savedModels?: string[];
    useFinetuned?: boolean; // Toggle to use fine-tuned model
  };
}

export interface TrainingDataEntry {
  context: string;
  currentNode: string;
  decision: 'expand' | 'cull';
}

export interface FineTuneModel {
  customName: string;
  officialName: string;
}

export interface TuningConfig {
  captureDecisions: boolean;
  trainingData: TrainingDataEntry[];
  externalDataSource: string | null; // Path to external training data file
  openaiApiKey: string;
  fineTunedModelName: string; // User's custom name for the model being created
  fineTunes: FineTuneModel[]; // List of fine-tuned models with custom names mapped to official names
  uploadedFileId: string | null;
  uploadStatus: string | null;
  currentJobId: string | null;
  outputs: string[]; // Status messages
}

export type PanelModule =
  | 'Tree'
  | 'Graph'
  | 'Agents'
  | 'Copilot'
  | 'Actions'
  | 'Settings'
  | 'Tuning'
  | null;

export interface PanelConfig {
  top: PanelModule;
  bottom: PanelModule;
}
