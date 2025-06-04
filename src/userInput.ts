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

  questions.push({
    type: "select",
    name: "action",
    message: "What action do you want to perform?",
    choices: [
      { title: "Copy/Sync environments", value: "copy" },
      { title: "Diff two environments", value: "diff" },
    ],
    initial: 0,
  });

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

  const responses = (await prompts(questions, {
    onCancel: () => {
      // Handle cancellation if needed, e.g., set a flag or return specific values
      console.log("Operation cancelled by user.");
      // process.exit(0); // Or throw an error, or return a specific structure
    },
  })) as UserInputs;

  // Conditional prompts for diff
  if (responses.action === "diff") {
    const diffQuestions: prompts.PromptObject<keyof UserInputs>[] = [];
    if (!responses.repoFullName) {
      // If repoFullName was not from env and not yet asked (it would be if action was asked first)
      diffQuestions.push({
        type: "text",
        name: "repoFullName",
        message: "Enter the repository name for diff (e.g., owner/repo):",
        validate: (value: string) =>
          value.includes("/") ? true : "Please use owner/repo format.",
      });
    }
    diffQuestions.push(
      {
        type: "text",
        name: "sourceEnvName",
        message: "Enter the name of the SOURCE environment for diff:",
      },
      {
        type: "text",
        name: "compareEnvName",
        message: "Enter the name of the COMPARE environment for diff:",
      }
    );
    const diffResponses = (await prompts(diffQuestions, {
      onCancel: () => {
        console.log("Operation cancelled by user.");
      },
    })) as UserInputs;
    responses.repoFullName =
      responses.repoFullName || diffResponses.repoFullName;
    responses.sourceEnvName = diffResponses.sourceEnvName;
    responses.compareEnvName = diffResponses.compareEnvName;
  } else if (responses.action === "copy") {
    // Ensure targetEnvName is asked if not already (it should be in the initial batch)
    if (!responses.targetEnvName) {
      const targetNameQ: prompts.PromptObject<keyof UserInputs> = {
        type: "text",
        name: "targetEnvName",
        message:
          "Enter the name of the TARGET GitHub Actions environment for copy/sync:",
      };
      const targetNameResponse = (await prompts(targetNameQ, {
        onCancel: () => {
          console.log("Operation cancelled by user.");
        },
      })) as UserInputs;
      responses.targetEnvName = targetNameResponse.targetEnvName;
    }
  }

  return {
    action: responses.action,
    repoFullName: repoFullNameFromEnv || responses.repoFullName,
    targetEnvName: responses.targetEnvName, // Will be undefined if action is 'diff'
    sourceEnvName: responses.sourceEnvName, // Will be undefined if action is 'copy'
    compareEnvName: responses.compareEnvName, // Will be undefined if action is 'copy'
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
