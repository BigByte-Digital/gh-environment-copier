export interface GitHubEnvironment {
  id: number;
  node_id: string;
  name: string;
  url: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  protection_rules?: unknown[];
  deployment_branch_policy?: unknown;
}

export interface GitHubPublicKey {
  key_id: string;
  key: string;
}

export interface OctokitError extends Error {
  status?: number;
  response?: {
    data?: unknown;
  };
}

export interface Variable {
  name: string;
  value: string;
}

export type Secret = Variable;

export interface SourceChoice {
  source: "env" | "file" | "skip";
}

export interface UserInputs {
  repoFullName?: string;
  targetEnvName?: string;
  action?: "copy" | "diff" | "export"; // Added export action
  sourceEnvName?: string; // Added for diff
  compareEnvName?: string; // Added for diff
  exportFilePath?: string; // Added for export
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
