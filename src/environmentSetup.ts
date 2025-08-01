import {
  getEnvironment,
  createEnvironment,
  getEnvironmentPublicKey,
  listVariables,
  listSecrets,
} from "./githubService";
import type { GitHubEnvironment, Variable, Secret } from "./types";
import * as fs from "node:fs/promises";
import * as path from "node:path";

export async function ensureTargetEnvExists(
  owner: string,
  repo: string,
  targetEnvName: string
): Promise<GitHubEnvironment | null> {
  let targetEnv: GitHubEnvironment | null = await getEnvironment(
    owner,
    repo,
    targetEnvName
  );
  if (!targetEnv) {
    console.log(
      `ℹ️ Target environment '${targetEnvName}' not found. Creating...`
    );
    try {
      await createEnvironment(owner, repo, targetEnvName);
      targetEnv = await getEnvironment(owner, repo, targetEnvName); // Re-fetch to confirm
      if (!targetEnv) {
        console.error(
          "❌ Failed to create or find target environment after creation attempt."
        );
        return null;
      }
      console.log(
        `✅ Target environment '${targetEnvName}' created (ID: ${targetEnv.id}).`
      );
    } catch (createError) {
      console.error(
        "❌ Error during target environment creation:",
        createError
      );
      return null;
    }
  } else {
    console.log(
      `✅ Target environment '${targetEnvName}' already exists (ID: ${targetEnv.id}).`
    );
  }
  return targetEnv;
}

export async function fetchEnvironmentPublicKey(
  owner: string,
  repo: string,
  targetEnvName: string
): Promise<{ key: string; keyId: string } | null> {
  try {
    console.log("Fetching public key for target environment...");
    const publicKeyData = await getEnvironmentPublicKey(
      owner,
      repo,
      targetEnvName
    );
    if (!publicKeyData || !publicKeyData.key || !publicKeyData.key_id) {
      console.error(
        "❌ Failed to fetch public key for the target environment. Cannot proceed with secrets."
      );
      return null;
    }
    console.log("✅ Public key fetched successfully.");
    return { key: publicKeyData.key, keyId: publicKeyData.key_id };
  } catch (e) {
    console.error("❌ Error fetching public key for target environment:", e);
    return null;
  }
}

export async function exportEnvironmentToFile(
  owner: string,
  repo: string,
  environmentName: string,
  outputFilePath?: string
): Promise<string | null> {
  try {
    console.log(`\n📄 Exporting environment '${environmentName}' to file...`);

    // Fetch variables and secrets
    const [variables, secrets] = await Promise.all([
      listVariables(owner, repo, environmentName),
      listSecrets(owner, repo, environmentName),
    ]);

    // Generate output content
    const timestamp = new Date().toISOString();
    let output = `# GitHub Environment Export: ${environmentName}\n`;
    output += `# Repository: ${owner}/${repo}\n`;
    output += `# Generated on: ${timestamp}\n\n`;

    // Export variables
    output += `# Environment Variables (${variables.length} total)\n`;
    if (variables.length > 0) {
      output += "# Format: VARIABLE_NAME=value\n\n";
      variables.forEach((variable: Variable) => {
        output += `${variable.name}=${variable.value}\n`;
      });
    } else {
      output += "# No variables found in this environment\n";
    }
    output += "\n";

    // Export secret names (values are not accessible via API for security)
    output += `# Secret Names (${secrets.length} total)\n`;
    output += "# Note: Secret values are not exported for security reasons\n";
    output += "# Format: SECRET_NAME= (you need to set values manually)\n\n";
    if (secrets.length > 0) {
      secrets.forEach((secret: Secret) => {
        output += `${secret.name}=\n`;
      });
    } else {
      output += "# No secrets found in this environment\n";
    }

    // Determine output file path
    const finalOutputPath =
      outputFilePath ||
      path.join(process.cwd(), `${environmentName}-export-${Date.now()}.env`);

    // Write to file
    await fs.writeFile(finalOutputPath, output, { encoding: "utf8" });

    console.log(`✅ Environment exported successfully to: ${finalOutputPath}`);
    console.log(`   Variables exported: ${variables.length}`);
    console.log(`   Secret names exported: ${secrets.length}`);

    return finalOutputPath;
  } catch (error) {
    console.error(
      `❌ Error exporting environment '${environmentName}':`,
      error
    );
    return null;
  }
}
