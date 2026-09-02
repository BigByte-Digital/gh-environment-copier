import prompts from 'prompts';
import { findEnvFiles } from './envFileScanner.js';
import { detectRepoFullName } from './git.js';
import { listEnvironments, listRepositories } from './githubService.js';

// Sentinel choice values. Neither form is a legal repository name, environment name or
// file path, so they never collide with a real entry in any of the lists below.
const MANUAL_ENTRY = '<manual-entry>';

const MANUAL_PATH_TITLE = '-- type a path manually --';
const MANUAL_REPO_TITLE = '-- type owner/repo manually --';
const MANUAL_ENV_TITLE = '-- type an environment name manually --';
const CREATE_ENV_TITLE = '-- create a new environment --';

type PickerChoice = prompts.Choice & { value: string };

const onCancel = () => {
  console.log('Operation cancelled by user.');
};

// Manual entry stays reachable even when the typed filter matches nothing else.
async function suggestKeepingSentinels(input: string, items: prompts.Choice[]): Promise<prompts.Choice[]> {
  const term = input.toLowerCase();
  return items.filter((item) => item.value === MANUAL_ENTRY || item.title.toLowerCase().includes(term));
}

async function promptForText(
  message: string,
  validate?: (value: string) => true | string,
): Promise<string | undefined> {
  const response = (await prompts({ type: 'text', name: 'value', message, validate }, { onCancel })) as {
    value?: string;
  };
  const value = response.value?.trim();
  return value ? value : undefined;
}

async function promptFromChoices(
  message: string,
  choices: PickerChoice[],
  filterable: boolean,
): Promise<string | undefined> {
  const response = (await prompts(
    filterable
      ? { type: 'autocomplete', name: 'value', message, choices, suggest: suggestKeepingSentinels }
      : { type: 'select', name: 'value', message, choices, initial: 0 },
    { onCancel },
  )) as { value?: string };
  return response.value;
}

// GitHub owner and repository names are limited to these characters, so anything else --
// whitespace in particular -- is rejected before it can reach the API as a confusing 404.
const REPO_FULL_NAME_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

export function isRepoFullName(value: string): boolean {
  return REPO_FULL_NAME_PATTERN.test(value.trim());
}

function validateRepoFullName(value: string): true | string {
  return isRepoFullName(value) ? true : 'Please use owner/repo format.';
}

export async function pickEnvFile(message: string): Promise<string | undefined> {
  const candidates = await findEnvFiles(process.cwd());
  if (candidates.length === 0) {
    console.log('ℹ️ No .env files found nearby.');
    return promptForText(message);
  }

  const choices: PickerChoice[] = [
    ...candidates.map((candidate) => ({
      title: `${candidate.relPath}  (${candidate.entryCount} ${candidate.entryCount === 1 ? 'entry' : 'entries'})`,
      value: candidate.path,
    })),
    { title: MANUAL_PATH_TITLE, value: MANUAL_ENTRY },
  ];

  const selected = await promptFromChoices(message, choices, true);
  if (selected === undefined) {
    return undefined;
  }
  return selected === MANUAL_ENTRY ? promptForText(message) : selected;
}

export async function pickRepo(message: string): Promise<string | undefined> {
  const detected = await detectRepoFullName();

  console.log('Fetching your repositories...');
  let repoNames: string[];
  try {
    repoNames = await listRepositories();
  } catch {
    console.log('⚠️ Could not list repositories. Enter the name manually.');
    return promptForText(message, validateRepoFullName);
  }

  if (repoNames.length === 0) {
    return promptForText(message, validateRepoFullName);
  }

  const ordered = detected ? [detected, ...repoNames.filter((name) => name !== detected)] : repoNames;
  const choices: PickerChoice[] = [
    ...ordered.map((name) => ({
      title: name === detected ? `${name}  (current directory)` : name,
      value: name,
    })),
    { title: MANUAL_REPO_TITLE, value: MANUAL_ENTRY },
  ];

  const selected = await promptFromChoices(message, choices, true);
  if (selected === undefined) {
    return undefined;
  }
  return selected === MANUAL_ENTRY ? promptForText(message, validateRepoFullName) : selected;
}

export async function pickEnvironment(
  owner: string,
  repo: string,
  message: string,
  options: { allowCreate?: boolean } = {},
): Promise<string | undefined> {
  let environments: string[];
  try {
    environments = await listEnvironments(owner, repo);
  } catch {
    return promptForText(message);
  }

  if (environments.length === 0) {
    console.log(`ℹ️ No environments listed for '${owner}/${repo}'.`);
    return promptForText(message);
  }

  // An environment hidden by permissions is still reachable by name, so the manual entry
  // is offered whether or not the caller can create one.
  const choices: PickerChoice[] = [
    ...environments.map((name) => ({ title: name, value: name })),
    { title: options.allowCreate ? CREATE_ENV_TITLE : MANUAL_ENV_TITLE, value: MANUAL_ENTRY },
  ];

  const selected = await promptFromChoices(message, choices, false);
  if (selected === undefined) {
    return undefined;
  }
  if (selected !== MANUAL_ENTRY) {
    return selected;
  }
  return promptForText(
    options.allowCreate ? 'Enter a name for the new environment:' : 'Enter the environment name:',
  );
}
