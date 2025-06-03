import prompts from "prompts";
import type {
  UserInputs,
  SourceChoice,
  FilePathResponse,
  SourceEnvNameResponse,
  SecretValueResponse,
} from "./types.js";

export async function getInitialUserInput(): Promise<UserInputs> {
  const repoFullNameFromEnv = process.env.REPO_FULL_NAME;
  const questions: prompts.PromptObject<keyof UserInputs>[] = [];

  if (!repoFullNameFromEnv) {
    questions.push({
      type: "text",
      name: "repoFullName",
      message: "Enter the target repository name (e.g., owner/repo):",
      validate: (value: string) =>
        value.includes("/") ? true : "Please use owner/repo format.",
    });
  }

  questions.push({
    type: "text",
    name: "targetEnvName",
    message: "Enter the name of the TARGET GitHub Actions environment:",
  });

  const responses = (await prompts(questions)) as UserInputs;

  return {
    repoFullName: repoFullNameFromEnv || responses.repoFullName,
    targetEnvName: responses.targetEnvName,
  };
}

export async function getVariableSourceChoice(): Promise<SourceChoice> {
  return (await prompts({
    type: "select",
    name: "source",
    message: "How do you want to source VARIABLES?",
    choices: [
      { title: "Copy from a source GitHub Environment", value: "env" },
      { title: "Import from a local .env file", value: "file" },
      { title: "Skip variable processing", value: "skip" },
    ],
    initial: 2, // Default to skip
  })) as SourceChoice;
}

export async function getSecretSourceChoice(): Promise<SourceChoice> {
  return (await prompts({
    type: "select",
    name: "source",
    message: "How do you want to source SECRETS?",
    choices: [
      {
        title:
          "Copy names from a source GitHub Environment (values will be prompted)",
        value: "env",
      },
      {
        title: "Import names and values from a local file (e.g., secrets.env)",
        value: "file",
      },
      { title: "Skip secret processing", value: "skip" },
    ],
    initial: 2, // Default to skip
  })) as SourceChoice;
}

export async function getFilePath(
  promptMessage: string
): Promise<string | undefined> {
  const response = (await prompts({
    type: "text",
    name: "path",
    message: promptMessage,
  })) as FilePathResponse;
  return response.path;
}

export async function getSourceEnvName(
  promptMessage: string
): Promise<string | undefined> {
  const response = (await prompts({
    type: "text",
    name: "name",
    message: promptMessage,
  })) as SourceEnvNameResponse;
  return response.name;
}

export async function getSecretValue(
  secretName: string
): Promise<string | undefined> {
  const response = (await prompts({
    type: "password", // Use password type for sensitive input
    name: "val",
    message: `Enter value for secret '${secretName}':`,
  })) as SecretValueResponse;
  return response.val;
}
