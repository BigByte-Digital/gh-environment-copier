import "dotenv/config";
import {
  ensureTargetEnvExists,
  fetchEnvironmentPublicKey,
  exportEnvironmentToFile,
} from "./environmentSetup";
import { processSecrets } from "./secretsManager";
import {
  getInitialUserInput,
  getVariableSourceChoice,
  getSecretSourceChoice,
} from "./userInput";
import { processVariables } from "./variablesManager";
import { performEnvDiff, displayDiffResultsConsole } from "./diffManager";

async function main() {
  const userInput = await getInitialUserInput();
  const {
    action,
    repoFullName,
    targetEnvName,
    sourceEnvName,
    compareEnvName,
    exportFilePath,
  } = userInput;

  if (!repoFullName) {
    console.log("Operation cancelled or missing repository input.");
    return;
  }

  const [owner, repo] = repoFullName.split("/");

  // Handle different actions
  if (action === "export") {
    if (!targetEnvName) {
      console.log("Environment name is required for export.");
      return;
    }

    console.log(
      `\n📄 Exporting environment '${targetEnvName}' from repo '${owner}/${repo}'...`
    );
    const exportPath = await exportEnvironmentToFile(
      owner,
      repo,
      targetEnvName,
      exportFilePath
    );
    if (exportPath) {
      console.log(
        `\n🎉 Export completed successfully! File saved to: ${exportPath}`
      );
    }
    return;
  }

  if (action === "diff") {
    if (!sourceEnvName || !compareEnvName) {
      console.log(
        "Both source and compare environment names are required for diff."
      );
      return;
    }

    console.log(
      `\n🔍 Comparing environments '${sourceEnvName}' and '${compareEnvName}' in repo '${owner}/${repo}'...`
    );
    const diffResults = await performEnvDiff(
      owner,
      repo,
      sourceEnvName,
      compareEnvName
    );
    if (diffResults) {
      displayDiffResultsConsole(diffResults);
      console.log("\n🎉 Diff completed successfully!");
    }
    return;
  }

  // Default action is "copy"
  if (!targetEnvName) {
    console.log("Target environment name is required for copy/sync.");
    return;
  }

  // Default action is "copy"
  if (!targetEnvName) {
    console.log("Target environment name is required for copy/sync.");
    return;
  }

  console.log(
    `\n🎯 Setting up TARGET environment '${targetEnvName}' for repo '${owner}/${repo}'...`
  );
  const targetEnv = await ensureTargetEnvExists(owner, repo, targetEnvName);
  if (!targetEnv) {
    return; // Error already logged by ensureTargetEnvExists
  }

  // --- Variables Processing ---
  console.log(
    `\n📋 Processing Variables for target environment '${targetEnvName}'...`
  );
  const variableSourceChoice = await getVariableSourceChoice();
  if (variableSourceChoice.source !== "skip") {
    await processVariables(owner, repo, targetEnvName, variableSourceChoice);
  } else {
    console.log("Skipping variable processing.");
  }

  // --- Secrets Processing ---
  console.log(
    `\n🔑 Processing Secrets for target environment '${targetEnvName}'...`
  );
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

  console.log(
    `\n🎉 Process finished for target environment '${targetEnvName}' in '${owner}/${repo}'.`
  );
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
