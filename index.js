"use strict";
require('dotenv').config();
const { getInitialUserInput, getVariableSourceChoice, getSecretSourceChoice } = require('./src/userInput');
const { ensureTargetEnvExists, fetchEnvironmentPublicKey } = require('./src/environmentSetup');
const { processVariables } = require('./src/variablesManager');
const { processSecrets } = require('./src/secretsManager');
async function main() {
    const { repoFullName, targetEnvName } = await getInitialUserInput();
    if (!repoFullName || !targetEnvName) {
        console.log('Operation cancelled or missing repository/target environment input.');
        return;
    }
    const [owner, repo] = repoFullName.split('/');
    console.log(`\n🎯 Setting up TARGET environment '${targetEnvName}' for repo '${owner}/${repo}'...`);
    const targetEnv = await ensureTargetEnvExists(owner, repo, targetEnvName);
    if (!targetEnv) {
        return; // Error already logged by ensureTargetEnvExists
    }
    // --- Variables Processing ---
    console.log(`\n📋 Processing Variables for target environment '${targetEnvName}'...`);
    const variableSourceChoice = await getVariableSourceChoice();
    if (variableSourceChoice.source !== 'skip') {
        await processVariables(owner, repo, targetEnvName, variableSourceChoice);
    }
    else {
        console.log('Skipping variable processing.');
    }
    // --- Secrets Processing ---
    console.log(`\n🔑 Processing Secrets for target environment '${targetEnvName}'...`);
    let secretSourceChoice = await getSecretSourceChoice(); // Made mutable
    let publicKeyInfo = null;
    if (secretSourceChoice.source !== 'skip') {
        publicKeyInfo = await fetchEnvironmentPublicKey(owner, repo, targetEnvName);
        if (!publicKeyInfo) {
            console.log('Skipping secret processing due to public key error.');
            secretSourceChoice.source = 'skip'; // Force skip if key fetch fails
        }
    }
    if (secretSourceChoice.source !== 'skip' && publicKeyInfo) {
        await processSecrets(owner, repo, targetEnvName, secretSourceChoice, publicKeyInfo.key, publicKeyInfo.keyId);
    }
    else if (secretSourceChoice.source !== 'skip' && !publicKeyInfo) {
        // This case should ideally be covered by the check above, but as a safeguard:
        console.log('Skipping secret processing as public key could not be fetched.');
    }
    else {
        console.log('Skipping secret processing.');
    }
    console.log(`\n🎉 Process finished for target environment '${targetEnvName}' in '${owner}/${repo}'.`);
}
main().catch(err => {
    console.error("\nAn unexpected error occurred:", err.message);
    if (err.response && err.response.data) {
        console.error("GitHub API Error:", JSON.stringify(err.response.data, null, 2));
    }
    // For more detailed stack trace if needed:
    // console.error(err.stack);
});
