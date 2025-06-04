import { listVariables, listSecrets } from "./githubService.js";
import type {
  Variable,
  DiffResults,
  DiffReportVariables,
  DiffReportSecrets,
} from "./types.js";

export async function performEnvDiff(
  owner: string,
  repo: string,
  sourceEnvName: string,
  compareEnvName: string
): Promise<DiffResults | null> {
  console.log(
    `\n🔄 Starting diff between '${sourceEnvName}' and '${compareEnvName}' for repo '${owner}/${repo}'...`
  );

  try {
    // Fetch variables
    const [sourceVars, compareVars] = await Promise.all([
      listVariables(owner, repo, sourceEnvName),
      listVariables(owner, repo, compareEnvName),
    ]);

    // Fetch secret names
    const [sourceSecretMetas, compareSecretMetas] = await Promise.all([
      listSecrets(owner, repo, sourceEnvName),
      listSecrets(owner, repo, compareEnvName),
    ]);
    const sourceSecretNames = sourceSecretMetas.map((s) => s.name);
    const compareSecretNames = compareSecretMetas.map((s) => s.name);

    // --- Diff Variables ---
    const sourceVarsMap = new Map(sourceVars.map((v) => [v.name, v.value]));
    const compareVarsMap = new Map(compareVars.map((v) => [v.name, v.value]));

    const diffResultVars: DiffReportVariables = {
      sourceOnly: [],
      compareOnly: [],
      valueChanged: [],
    };

    for (const [name, sourceValue] of sourceVarsMap) {
      if (compareVarsMap.has(name)) {
        const compareValue = compareVarsMap.get(name)!;
        if (sourceValue !== compareValue) {
          diffResultVars.valueChanged.push({ name, sourceValue, compareValue });
        }
      } else {
        diffResultVars.sourceOnly.push({ name, value: sourceValue });
      }
    }
    for (const [name, compareValue] of compareVarsMap) {
      if (!sourceVarsMap.has(name)) {
        diffResultVars.compareOnly.push({ name, value: compareValue });
      }
    }

    // --- Diff Secrets (Names) ---
    const diffResultSecrets: DiffReportSecrets = {
      sourceOnlyNames: [],
      compareOnlyNames: [],
    };

    const sourceSecretNamesSet = new Set(sourceSecretNames);
    const compareSecretNamesSet = new Set(compareSecretNames);

    for (const name of sourceSecretNames) {
      if (!compareSecretNamesSet.has(name)) {
        diffResultSecrets.sourceOnlyNames.push(name);
      }
    }
    for (const name of compareSecretNames) {
      if (!sourceSecretNamesSet.has(name)) {
        diffResultSecrets.compareOnlyNames.push(name);
      }
    }

    return {
      variables: diffResultVars,
      secrets: diffResultSecrets,
      sourceEnvName,
      compareEnvName,
    };
  } catch (error: any) {
    console.error(`❌ Error during environment diff: ${error.message}`);
    return null;
  }
}

export function displayDiffResultsConsole(results: DiffResults): void {
  const { variables, secrets, sourceEnvName, compareEnvName } = results;

  console.log(
    `\n--- Diff Report: '${sourceEnvName}' vs '${compareEnvName}' ---`
  );

  // Variables
  console.log("\n📋 Variables:");
  if (
    variables.sourceOnly.length === 0 &&
    variables.compareOnly.length === 0 &&
    variables.valueChanged.length === 0
  ) {
    console.log("  ✅ Variables are identical in both environments.");
  } else {
    if (variables.sourceOnly.length > 0) {
      console.log(`  ➕ Only in '${sourceEnvName}':`);
      variables.sourceOnly.forEach((v) =>
        console.log(`    - ${v.name}=${v.value}`)
      );
    }
    if (variables.compareOnly.length > 0) {
      console.log(
        `  ➖ Only in '${compareEnvName}' (missing from '${sourceEnvName}'):`
      );
      variables.compareOnly.forEach((v) =>
        console.log(`    - ${v.name}=${v.value}`)
      );
    }
    if (variables.valueChanged.length > 0) {
      console.log("  🔄 Different values:");
      variables.valueChanged.forEach((v) =>
        console.log(
          `    - ${v.name}: ('${sourceEnvName}': "${v.sourceValue}", '${compareEnvName}': "${v.compareValue}")`
        )
      );
    }
  }

  // Secrets
  console.log("\n🔑 Secrets (names only):");
  if (
    secrets.sourceOnlyNames.length === 0 &&
    secrets.compareOnlyNames.length === 0
  ) {
    console.log("  ✅ Secret names are identical in both environments.");
  } else {
    if (secrets.sourceOnlyNames.length > 0) {
      console.log(`  ➕ Only in '${sourceEnvName}':`);
      secrets.sourceOnlyNames.forEach((name) => console.log(`    - ${name}`));
    }
    if (secrets.compareOnlyNames.length > 0) {
      console.log(
        `  ➖ Only in '${compareEnvName}' (missing from '${sourceEnvName}'):`
      );
      secrets.compareOnlyNames.forEach((name) => console.log(`    - ${name}`));
    }
  }
  console.log("\n--- End of Diff Report ---");
}

export function generateEnvFileContent(results: DiffResults): void {
  const { variables, secrets, sourceEnvName, compareEnvName } = results;
  let output = `# .env content to help align '${compareEnvName}' with '${sourceEnvName}'\n`;
  output += `# Generated on ${new Date().toISOString()}\n\n`;

  let changesMade = false;

  if (variables.sourceOnly.length > 0 || variables.valueChanged.length > 0) {
    output +=
      "## Variables to Add or Update in '${compareEnvName}' (from '${sourceEnvName}') ##\n";
    variables.sourceOnly.forEach((v) => {
      output += `${v.name}=${v.value}\n`;
      changesMade = true;
    });
    variables.valueChanged.forEach((v) => {
      output += `${v.name}=${v.sourceValue} # Previous value in '${compareEnvName}': ${v.compareValue}\n`;
      changesMade = true;
    });
    output += "\n";
  }

  if (secrets.sourceOnlyNames.length > 0) {
    output +=
      "## Secrets to Add in '${compareEnvName}' (names from '${sourceEnvName}', values must be set manually) ##\n";
    secrets.sourceOnlyNames.forEach((name) => {
      output += `${name}= # Add value manually\n`;
      changesMade = true;
    });
    output += "\n";
  }

  if (variables.compareOnly.length > 0) {
    output += `## Variables present ONLY in '${compareEnvName}' (not in '${sourceEnvName}') ##\n`;
    variables.compareOnly.forEach((v) => {
      output += `# ${v.name}=${v.value} # Only in '${compareEnvName}'\n`;
      changesMade = true;
    });
    output += "\n";
  }

  if (secrets.compareOnlyNames.length > 0) {
    output += `## Secret names present ONLY in '${compareEnvName}' (not in '${sourceEnvName}') ##\n`;
    secrets.compareOnlyNames.forEach((name) => {
      output += `# ${name}= # Only in '${compareEnvName}'\n`;
      changesMade = true;
    });
    output += "\n";
  }

  if (!changesMade) {
    output += `# No differences found that require updating '${compareEnvName}' based on '${sourceEnvName}', or items only in '${compareEnvName}'.\n`;
  }
  output += `# End of generated .env content.\n`;

  console.log("\n--- Recommended .env content (copy and paste below) ---");
  console.log(output);
  console.log("--- End of .env content ---");
}
