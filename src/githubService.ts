import { Octokit } from "@octokit/rest";
import { encryptSecret } from "./encryptionUtils.js";
import type {
  GitHubEnvironment,
  GitHubPublicKey,
  Variable,
  Secret,
  OctokitError,
} from "./types.js";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

if (!GITHUB_TOKEN) {
  console.error("Error: GITHUB_TOKEN not found in .env file.");
  process.exit(1);
}

const octokit = new Octokit({ auth: GITHUB_TOKEN });

export async function getEnvironment(
  owner: string,
  repo: string,
  environment_name: string
): Promise<GitHubEnvironment | null> {
  try {
    const { data: environment } = await octokit.rest.repos.getEnvironment({
      owner,
      repo,
      environment_name,
    });
    return environment as GitHubEnvironment;
  } catch (error) {
    const octokitError = error as OctokitError;
    if (octokitError.status === 404) {
      return null; // Environment not found is a valid case
    }
    console.error(
      `Error getting environment '${environment_name}':`,
      octokitError.message
    );
    throw octokitError;
  }
}

export async function createEnvironment(
  owner: string,
  repo: string,
  environment_name: string
): Promise<void> {
  try {
    console.log(`Creating environment '${environment_name}'...`);
    await octokit.rest.repos.createOrUpdateEnvironment({
      owner,
      repo,
      environment_name,
    });
    console.log(`Environment '${environment_name}' created successfully.`);
  } catch (error) {
    const octokitError = error as OctokitError;
    console.error(
      `Error creating environment '${environment_name}':`,
      octokitError.message
    );
    throw octokitError;
  }
}

export async function listVariables(
  owner: string,
  repo: string,
  environment_name: string
): Promise<Variable[]> {
  try {
    const variables = await octokit.paginate(
      octokit.rest.actions.listEnvironmentVariables,
      {
        owner,
        repo,
        environment_name,
        per_page: 100,
      }
    );
    return variables as Variable[];
  } catch (error) {
    const octokitError = error as OctokitError;
    console.error(
      `Error listing variables for environment '${environment_name}':`,
      octokitError.message
    );
    throw octokitError;
  }
}

export async function createOrUpdateVariable(
  owner: string,
  repo: string,
  environment_name: string,
  variable_name: string,
  value: string
): Promise<void> {
  try {
    await octokit.rest.actions.createEnvironmentVariable({
      owner,
      repo,
      environment_name,
      name: variable_name,
      value: value,
    });
    console.log(`  Variable '${variable_name}' set in '${environment_name}'.`);
  } catch (error: any) {
    // Keeping any here as the error structure for "already exists" might be specific
    if (error.message && error.message.includes("already exists")) {
      try {
        await octokit.rest.actions.updateEnvironmentVariable({
          owner,
          repo,
          environment_name,
          name: variable_name,
          value: value,
        });
        console.log(
          `  Variable '${variable_name}' updated in '${environment_name}'.`
        );
      } catch (updateError) {
        const octokitUpdateError = updateError as OctokitError;
        console.error(
          `  Error updating variable '${variable_name}' in '${environment_name}':`,
          octokitUpdateError.message
        );
      }
    } else {
      const octokitError = error as OctokitError;
      console.error(
        `  Error setting variable '${variable_name}' in '${environment_name}':`,
        octokitError.message
      );
    }
  }
}

export async function listSecrets(
  owner: string,
  repo: string,
  environment_name: string
): Promise<Secret[]> {
  try {
    const secrets = await octokit.paginate(
      octokit.rest.actions.listEnvironmentSecrets,
      {
        owner,
        repo,
        environment_name,
        per_page: 100,
      }
    );
    return secrets.map((s: any) => ({ name: s.name, value: "" })) as Secret[]; // Secrets list doesn't return values
  } catch (error) {
    const octokitError = error as OctokitError;
    console.error(
      `Error listing secrets for environment '${environment_name}':`,
      octokitError.message
    );
    throw octokitError;
  }
}

export async function createOrUpdateSecret(
  owner: string,
  repo: string,
  environment_name: string,
  secret_name: string,
  value: string,
  environment_public_key: string,
  environment_public_key_id: string
): Promise<void> {
  try {
    const encryptedValue = await encryptSecret(value, environment_public_key);

    await octokit.rest.actions.createOrUpdateEnvironmentSecret({
      owner,
      repo,
      environment_name,
      secret_name,
      encrypted_value: encryptedValue,
      key_id: environment_public_key_id,
    });

    if (value === "") {
      console.log(
        `  Secret '${secret_name}' (empty value) set/updated in '${environment_name}'.`
      );
    } else {
      console.log(
        `  Secret '${secret_name}' set/updated in '${environment_name}'.`
      );
    }
  } catch (error) {
    const octokitError = error as OctokitError;
    console.error(
      `  Error setting/updating secret '${secret_name}' in '${environment_name}':`,
      octokitError.message
    );
    if (octokitError.response && octokitError.response.data) {
      console.error(
        "  Full error details:",
        JSON.stringify(octokitError.response.data)
      );
    }
    console.error(
      `  Ensure your PAT has 'repo' scope and you have admin rights to the repository.`
    );
  }
}

export async function getEnvironmentPublicKey(
  owner: string,
  repo: string,
  environment_name: string
): Promise<GitHubPublicKey | null> {
  try {
    const { data } = await octokit.rest.actions.getEnvironmentPublicKey({
      owner,
      repo,
      environment_name,
    });
    return { key: data.key, key_id: data.key_id } as GitHubPublicKey;
  } catch (error) {
    const octokitError = error as OctokitError;
    console.error(
      `Error getting public key for environment '${environment_name}':`,
      octokitError.message
    );
    throw octokitError;
  }
}
