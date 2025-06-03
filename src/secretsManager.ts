// filepath: /Users/dom/projects/copy-github-env/src/secretsManager.ts
import { parseEnvFile } from "./fileUtils.js";
import { listSecrets, createOrUpdateSecret } from "./githubService.js";
import { getFilePath, getSourceEnvName, getSecretValue } from "./userInput.js";
import type { Secret, SourceChoice } from "./types.js";

export async function processSecrets(
  owner: string,
  repo: string,
  targetEnvName: string,
  secretSourceChoice: SourceChoice,
  publicKey: string,
  publicKeyId: string
): Promise<void> {
  let secretsToProcessForTarget: Partial<Secret>[] = [];
  let promptForSecretValues = false;

  if (secretSourceChoice.source === "file") {
    const secretFilePath = await getFilePath(
      "Enter the path to the secrets file (e.g., secrets.env):"
    );
    if (secretFilePath) {
      const parsedSecrets = await parseEnvFile(secretFilePath);
      if (parsedSecrets) {
        secretsToProcessForTarget = parsedSecrets;
      } else {
        console.log("No secrets loaded from file or file not found.");
      }
    } else {
      console.log("No file path provided for secrets. Skipping file import.");
    }
  } else if (secretSourceChoice.source === "env") {
    const sourceEnvName = await getSourceEnvName(
      "Enter the name of the SOURCE GitHub Actions environment to copy secret names FROM:"
    );
    if (sourceEnvName) {
      console.log(
        `Fetching secret names from source environment '${sourceEnvName}'...`
      );
      try {
        const sourceSecrets = await listSecrets(owner, repo, sourceEnvName);
        if (sourceSecrets && sourceSecrets.length > 0) {
          secretsToProcessForTarget = sourceSecrets.map((s) => ({
            name: s.name,
          }));
          promptForSecretValues = true;
          console.log(
            `Found ${sourceSecrets.length} secret names in '${sourceEnvName}'. You will be prompted for their values.`
          );
        } else {
          console.log(
            `No secrets found in source environment '${sourceEnvName}'.`
          );
        }
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        console.error(
          `Error fetching secrets from source environment '${sourceEnvName}': ${errorMessage}`
        );
      }
    } else {
      console.log("No source environment name provided. Skipping secret copy.");
    }
  }

  if (secretsToProcessForTarget.length > 0) {
    console.log(
      `\nProcessing ${secretsToProcessForTarget.length} secret(s) for '${targetEnvName}'...`
    );
    let secretsProcessedCount = 0;

    for (const secret of secretsToProcessForTarget) {
      if (!secret.name) continue;

      let secretValue = secret.value;

      if (promptForSecretValues && secretValue === undefined) {
        secretValue = await getSecretValue(secret.name);
        if (secretValue === undefined) {
          console.log(
            `Skipping secret '${secret.name}' as no value was provided.`
          );
          continue;
        }
      } else if (secretValue === undefined) {
        console.warn(
          `Value for secret '${secret.name}' is undefined. Skipping.`
        );
        continue;
      }

      await createOrUpdateSecret(
        owner,
        repo,
        targetEnvName,
        secret.name,
        secretValue,
        publicKey,
        publicKeyId
      );
      secretsProcessedCount++;
    }
    console.log(
      `✅ ${secretsProcessedCount} secret(s) processed into '${targetEnvName}'.`
    );
  } else if (secretSourceChoice.source !== "skip") {
    console.log("No secrets to process.");
  }
}
