import "dotenv/config";
import {
  getInitialUserInput,
  getVariableSourceChoice,
  getSecretSourceChoice,
} from "./src/userInput";
import {
  ensureTargetEnvExists,
  fetchEnvironmentPublicKey,
} from "./src/environmentSetup";
import { processVariables } from "./src/variablesManager";
import { processSecrets } from "./src/secretsManager";

async function main() {
  const { repoFullName, targetEnvName } = await getInitialUserInput();

  if (!repoFullName || !targetEnvName) {
    console.log(
      "Operation cancelled or missing repository/target environment input."
    );
    return;
  }

  const [owner, repo] = repoFullName.split("/");

  console.log(`
🎯 Setting up TARGET environment '${targetEnvName}' for repo '${owner}/${repo}'...`);
  const targetEnv = await ensureTargetEnvExists(owner, repo, targetEnvName);
  if (!targetEnv) {
    return; // Error already logged by ensureTargetEnvExists
  }

  // --- Variables Processing ---
  console.log(`
📋 Processing Variables for target environment '${targetEnvName}'...`);
  const variableSourceChoice = await getVariableSourceChoice();
  if (variableSourceChoice.source !== "skip") {
    await processVariables(owner, repo, targetEnvName, variableSourceChoice);
  } else {
    console.log("Skipping variable processing.");
  }

  // --- Secrets Processing ---
  console.log(`
🔑 Processing Secrets for target environment '${targetEnvName}'...`);
  const secretSourceChoiceInput = await getSecretSourceChoice(); // Renamed to avoid conflict
  let currentSecretSource = secretSourceChoiceInput.source; // Use a mutable variable for source

  let publicKeyInfo = null;

  if (currentSecretSource !== "skip") {
    publicKeyInfo = await fetchEnvironmentPublicKey(owner, repo, targetEnvName);
    if (!publicKeyInfo) {
      console.log("Skipping secret processing due to public key error.");
      currentSecretSource = "skip"; // Force skip if key fetch fails
    }
  }

  if (currentSecretSource !== "skip" && publicKeyInfo) {
    await processSecrets(
      owner,
      repo,
      targetEnvName,
      { source: currentSecretSource }, // Reconstruct SourceChoice
      publicKeyInfo.key,
      publicKeyInfo.keyId
    );
  } else if (currentSecretSource !== "skip" && !publicKeyInfo) {
    // This case should ideally be covered by the check above, but as a safeguard:
    console.log(
      "Skipping secret processing as public key could not be fetched."
    );
  } else {
    console.log("Skipping secret processing.");
  }

  console.log(`
🎉 Process finished for target environment '${targetEnvName}' in '${owner}/${repo}'.`);
}

main().catch((err) => {
  console.error("\nAn unexpected error occurred:", err.message);
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  const anyErr = err as any;
  if (anyErr.response?.data) {
    // Using optional chaining
    console.error(
      "GitHub API Error:",
      JSON.stringify(anyErr.response.data, null, 2)
    );
  }
  // For more detailed stack trace if needed:
  // console.error(err.stack);
});
