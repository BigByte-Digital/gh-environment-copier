import prompts from "prompts";
import * as fs from "node:fs/promises";
import * as path from "node:path";
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

  // Check for GITHUB_TOKEN and offer to help create it
  if (!process.env.GITHUB_TOKEN) {
    const tokenSetup = await prompts({
      type: "confirm",
      name: "setupToken",
      message:
        "It seems GITHUB_TOKEN is not set in your .env file. Would you like guidance on creating one and adding it?",
      initial: true,
    });
    if (tokenSetup.setupToken) {
      await offerTokenCreationGuidance();
      // Re-check after guidance
      // Note: This requires the user to manually update .env and restart the script,
      // or for the script to dynamically reload .env, which is more complex.
      // For simplicity, we'll instruct them to restart.
      console.log(
        "Please update your .env file with the GITHUB_TOKEN and restart the script."
      );
      process.exit(0);
    } else {
      console.log(
        "GITHUB_TOKEN is required to interact with the GitHub API. Please set it in your .env file."
      );
      process.exit(1);
    }
  }

  questions.push({
    type: "select",
    name: "action",
    message: "What action do you want to perform?",
    choices: [
      { title: "Copy/Sync environments", value: "copy" },
      { title: "Diff two environments", value: "diff" },
      { title: "Export environment to file", value: "export" },
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
  } else if (responses.action === "export") {
    // For export, we need the environment name to export and optionally a file path
    if (!responses.targetEnvName) {
      const exportQuestions: prompts.PromptObject<keyof UserInputs>[] = [
        {
          type: "text",
          name: "targetEnvName",
          message: "Enter the name of the environment to export:",
        },
        {
          type: "text",
          name: "exportFilePath",
          message:
            "Enter the output file path (optional, will auto-generate if empty):",
          initial: "",
        },
      ];
      const exportResponses = (await prompts(exportQuestions, {
        onCancel: () => {
          console.log("Operation cancelled by user.");
        },
      })) as UserInputs;
      responses.targetEnvName = exportResponses.targetEnvName;
      responses.exportFilePath = exportResponses.exportFilePath;
    }
  }

  return {
    action: responses.action,
    repoFullName: repoFullNameFromEnv || responses.repoFullName,
    targetEnvName: responses.targetEnvName,
    sourceEnvName: responses.sourceEnvName,
    compareEnvName: responses.compareEnvName,
    exportFilePath: responses.exportFilePath,
  };
}

export async function offerTokenCreationGuidance(): Promise<void> {
  console.log(`
--------------------------------------------------------------------------------------
GUIDE: Creating a GitHub Personal Access Token (PAT) for GitHub Environment Cloner
--------------------------------------------------------------------------------------

This tool requires a GitHub Personal Access Token (PAT) to interact with the GitHub API.

1.  **Go to GitHub PAT Settings:**
    Open your browser and navigate to: https://github.com/settings/tokens?type=beta

2.  **Generate a new token:**
    - Click "Generate new token" (select "classic" if "fine-grained" is too complex).
    - **Note:** Give your token a descriptive name, e.g., "gh-env-cloner-token".
    - **Expiration:** Choose an appropriate expiration period.
    - **Scopes (for classic tokens):**
        - Select the \`repo\` scope. This allows the tool to access your repositories,
          read environments, variables, and secrets, and create/update them.
        - If you need to manage environments for an ORGANIZATION (not just your personal account)
          and the environment is not yet created or you need to manage organization-level
          secrets/variables that might be inherited, you might also need \`admin:org\`
          (specifically \`read:org\` and \`write:org\` if using fine-grained tokens for org-level resources).
          Start with just \`repo\` and add \`admin:org\` only if you encounter permissions issues
          for organization-owned repositories.
    - **Repository access (for fine-grained tokens):**
        - Select "Only select repositories" and choose the repository you intend to work with.
        - Under "Repository permissions":
            - "Actions": Read and Write (to manage environment variables and secrets)
            - "Administration": Read-only (to check if an environment exists) - or "Read and Write" if you want the tool to create environments.
            - "Secrets": Read and Write
            - "Variables": Read and Write
            - "Environments": Read and Write
        - Under "Organization permissions" (if applicable and needed):
            - "Organization administration": Read-only (or Read and Write if creating org-level items)

3.  **Generate Token:**
    Click "Generate token" at the bottom of the page.

4.  **COPY THE TOKEN IMMEDIATELY!**
    GitHub will only show you the token ONCE. Copy it to your clipboard.

5.  **Create or update your .env file:**
    In the root directory of this project, create a file named \`.env\` (if it doesn't exist).
    Add the following line, replacing \`your_github_pat_here\` with the token you just copied:

    GITHUB_TOKEN=your_github_pat_here

    Example \`.env\` file content:
    \`\`\`
    GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
    \`\`\`

6.  **IMPORTANT: Secure your .env file:**
    Ensure your \`.env\` file is listed in your \`.gitignore\` file to prevent
    accidentally committing your token to version control.
    If \`.gitignore\` doesn't have it, add a line:
    \`\`\`
    .env
    \`\`\`

7.  **Restart the script:**
    After saving your token in the \`.env\` file, please restart this script.

--------------------------------------------------------------------------------------
`);

  const envFilePath = path.join(process.cwd(), ".env");
  try {
    await fs.access(envFilePath); // Check if .env exists
    console.log(
      `ℹ️  An .env file already exists at: ${envFilePath}. Please ensure your GITHUB_TOKEN is correctly set there.`
    );
  } catch {
    const createEnvFile = await prompts({
      type: "confirm",
      name: "create",
      message: `No .env file found. Would you like to create one now with the GITHUB_TOKEN field? (You'll still need to paste the token value manually)`,
      initial: true,
    });
    if (createEnvFile.create) {
      await fs.writeFile(envFilePath, "GITHUB_TOKEN=your_github_pat_here\n");
      console.log(
        `✅ .env file created at ${envFilePath}. Please open it and paste your GitHub token.`
      );
    }
  }
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
