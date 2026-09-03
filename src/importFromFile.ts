import prompts from 'prompts';
import { triageEntries } from './entryTriage.js';
import { fetchEnvironmentPublicKey } from './environmentSetup.js';
import { parseEnvFile } from './fileUtils.js';
import { createOrUpdateSecret, createOrUpdateVariable, deleteVariable, listVariables } from './githubService.js';
import { pickEnvFile } from './pickers.js';
import type { Variable } from './types.js';

// Names a key already held as a plaintext variable in the target that the operator has now
// marked secret. The plaintext copy stays readable until it is removed, so it is offered
// for deletion rather than left behind.
async function confirmStrayDeletion(strays: string[], targetEnvName: string): Promise<boolean> {
  console.log(`\n⚠️ ${strays.length} of these already exist as plaintext variables in '${targetEnvName}':`);
  for (const name of strays) {
    console.log(`   - ${name}`);
  }

  const answer = (await prompts({
    type: 'confirm',
    name: 'remove',
    message: `Delete ${strays.length} plaintext variable(s) once the secrets are written?`,
    initial: true,
  })) as { remove?: boolean };

  return answer.remove === true;
}

export async function importFromFile(owner: string, repo: string, targetEnvName: string): Promise<void> {
  const filePath = await pickEnvFile('Select the file to import from:');
  if (!filePath) {
    console.log('No file selected. Skipping import.');
    return;
  }

  const entries = await parseEnvFile(filePath);
  if (!entries || entries.length === 0) {
    console.log('No entries loaded from file.');
    return;
  }

  if (!process.stdin.isTTY) {
    console.log('❌ Importing needs an interactive terminal to mark each key as a variable or a secret.');
    return;
  }

  console.log(`\nLoaded ${entries.length} entries from ${filePath}.\n`);
  const classification = await triageEntries(entries);
  if (!classification) {
    console.log('\nImport cancelled. Nothing was written.');
    return;
  }

  const variables = entries.filter((entry) => classification.get(entry.name) === 'variable');
  const secrets = entries.filter((entry) => classification.get(entry.name) === 'secret');

  let strays: string[] = [];
  if (secrets.length > 0) {
    const existing = await listVariables(owner, repo, targetEnvName);
    const existingNames = new Set(existing.map((variable) => variable.name));
    strays = secrets.map((secret) => secret.name).filter((name) => existingNames.has(name));
  }
  const removeStrays = strays.length > 0 && (await confirmStrayDeletion(strays, targetEnvName));

  if (variables.length > 0) {
    console.log(`\nWriting ${variables.length} variable(s) to '${targetEnvName}'...`);
    for (const variable of variables) {
      await createOrUpdateVariable(owner, repo, targetEnvName, variable.name, variable.value);
    }
  }

  const written = await writeSecrets(owner, repo, targetEnvName, secrets);

  if (removeStrays) {
    // Only a key whose encrypted copy landed gives up its plaintext one.
    const removable = strays.filter((name) => written.has(name));
    console.log(`\nRemoving ${removable.length} plaintext variable(s)...`);
    for (const name of removable) {
      await deleteVariable(owner, repo, targetEnvName, name);
    }
  }

  console.log(
    `\n✅ ${variables.length} variable(s) and ${written.size} secret(s) written to '${targetEnvName}'.`
  );
}

async function writeSecrets(
  owner: string,
  repo: string,
  targetEnvName: string,
  secrets: Variable[]
): Promise<Set<string>> {
  const written = new Set<string>();
  if (secrets.length === 0) {
    return written;
  }

  const publicKey = await fetchEnvironmentPublicKey(owner, repo, targetEnvName);
  if (!publicKey) {
    console.log('❌ Could not fetch the environment public key. No secrets were written.');
    return written;
  }

  console.log(`\nWriting ${secrets.length} secret(s) to '${targetEnvName}'...`);
  for (const secret of secrets) {
    const ok = await createOrUpdateSecret(
      owner,
      repo,
      targetEnvName,
      secret.name,
      secret.value,
      publicKey.key,
      publicKey.keyId
    );
    if (ok) {
      written.add(secret.name);
    }
  }

  return written;
}
