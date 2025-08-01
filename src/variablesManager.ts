// filepath: /Users/dom/projects/copy-github-env/src/variablesManager.ts
import { getFilePath, getSourceEnvName } from "./userInput.js";
import { parseEnvFile } from "./fileUtils.js";
import { listVariables, createOrUpdateVariable } from "./githubService.js";
import type { Variable, SourceChoice } from "./types.js";

export async function processVariables(
  owner: string,
  repo: string,
  targetEnvName: string,
  variableSourceChoice: SourceChoice
): Promise<void> {
  let variablesToProcess: Variable[] = [];

  if (variableSourceChoice.source === "file") {
    const variableFilePath = await getFilePath(
      "Enter the path to the variables file (e.g., variables.env):"
    );
    if (variableFilePath) {
      const parsedVars = await parseEnvFile(variableFilePath);
      if (parsedVars) {
        variablesToProcess = parsedVars;
      } else {
        console.log("No variables loaded from file or file not found.");
      }
    } else {
      console.log("No file path provided for variables. Skipping file import.");
    }
  } else if (variableSourceChoice.source === "env") {
    const sourceEnvName = await getSourceEnvName(
      "Enter the name of the SOURCE GitHub Actions environment to copy variables FROM:"
    );
    if (sourceEnvName) {
      console.log(
        `Fetching variables from source environment '${sourceEnvName}'...`
      );
      try {
        const sourceVars = await listVariables(owner, repo, sourceEnvName);
        if (sourceVars && sourceVars.length > 0) {
          variablesToProcess = sourceVars.map((v) => ({
            name: v.name,
            value: v.value,
          }));
          console.log(
            `Found ${sourceVars.length} variables in '${sourceEnvName}'.`
          );
        } else {
          console.log(
            `No variables found in source environment '${sourceEnvName}'.`
          );
        }
      } catch (error) {
        console.error(
          `Error fetching variables from source environment '${sourceEnvName}'`,
          error
        );
      }
    } else {
      console.log(
        "No source environment name provided. Skipping variable copy."
      );
    }
  }

  if (variablesToProcess.length > 0) {
    console.log(
      `\nProcessing ${variablesToProcess.length} variable(s) for '${targetEnvName}'...`
    );
    let variablesProcessedCount = 0;
    for (const variable of variablesToProcess) {
      await createOrUpdateVariable(
        owner,
        repo,
        targetEnvName,
        variable.name,
        variable.value
      );
      variablesProcessedCount++;
    }
    console.log(
      `✅ ${variablesProcessedCount} variable(s) processed into '${targetEnvName}'.`
    );
  } else if (variableSourceChoice.source !== "skip") {
    console.log("No variables to process.");
  }
}
