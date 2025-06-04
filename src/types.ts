export interface GitHubEnvironment {
  id: number;
  node_id: string;
  name: string;
  url: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  protection_rules?: Array<any>; // Define more specific type if needed
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  deployment_branch_policy?: any; // Define more specific type if needed
}

export interface GitHubPublicKey {
  key_id: string;
  key: string;
}

export interface OctokitError extends Error {
  status?: number;
  response?: {
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    data: any;
  };
}

export interface Variable {
  name: string;
  value: string;
}

export interface Secret extends Variable {}

export interface SourceChoice {
  source: "env" | "file" | "skip";
}

export interface UserInputs {
  repoFullName?: string;
  targetEnvName?: string;
  action?: "copy" | "diff"; // Added action
  sourceEnvName?: string; // Added for diff
  compareEnvName?: string; // Added for diff
}

export interface FilePathResponse {
  path?: string;
}

export interface SourceEnvNameResponse {
  name?: string;
}

export interface SecretValueResponse {
  val?: string;
}

// --- Diff Types ---
export interface DiffReportVariables {
  sourceOnly: Variable[];
  compareOnly: Variable[];
  valueChanged: { name: string; sourceValue: string; compareValue: string }[];
}

export interface DiffReportSecrets {
  sourceOnlyNames: string[];
  compareOnlyNames: string[];
}

export interface DiffResults {
  variables: DiffReportVariables;
  secrets: DiffReportSecrets;
  sourceEnvName: string;
  compareEnvName: string;
}
