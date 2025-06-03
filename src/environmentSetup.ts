import {
  getEnvironment,
  createEnvironment,
  getEnvironmentPublicKey,
} from "./githubService";
import type { GitHubEnvironment } from "./types";

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
    } catch (createError: any) {
      console.error(
        "❌ Error during target environment creation:",
        createError.message
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
  } catch (e: any) {
    console.error(
      "❌ Error fetching public key for target environment:",
      e.message
    );
    return null;
  }
}
