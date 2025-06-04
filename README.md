# GitHub Environment Cloner

A command-line tool to simplify copying variables and secrets between GitHub Actions environments or from local `.env` files to a GitHub Actions environment.

This tool helps maintain consistency and reduces manual effort when managing multiple environments or setting up new ones based on existing configurations.

## Features

- Copy variables from one GitHub Actions environment to another.
- Copy secret names from one GitHub Actions environment to another (values will be prompted for security).
- Import variables from a local `.env` file to a GitHub Actions environment.
- Import secrets (names and values) from a local `.env` file to a GitHub Actions environment.
- Interactive prompts for easy input and selection.
- Securely handles GitHub Personal Access Tokens (PATs) via `.env` file.
- Encrypts secrets before sending them to GitHub using `libsodium-wrappers`.

## Prerequisites

- Node.js (v16 or higher recommended)
- pnpm (or npm/yarn)
- A GitHub Personal Access Token (PAT) with the `repo` scope. This token is required to interact with the GitHub API for reading and writing environment variables and secrets.

## Setup

1.  **Clone the repository (or set up your own project):**

    ```bash
    # If you have cloned this repository
    git clone <repository-url>
    cd gh-environment-copier
    ```

2.  **Install dependencies:**

    ```bash
    pnpm install
    ```

3.  **Create a `.env` file:**
    In the root of the project, create a file named `.env` and add your GitHub Personal Access Token:
    ```env
    GITHUB_TOKEN=your_github_pat_here
    ```
    **Important:** Add `.env` to your `.gitignore` file to prevent accidentally committing your PAT.

## Usage

1.  **Build the TypeScript code (if you made changes or are running for the first time after setup):**

    ```bash
    pnpm build
    ```

2.  **Run the tool:**
    ```bash
    pnpm start
    ```
    Or, for development (runs directly with `ts-node`):
    ```bash
    pnpm dev
    ```

The tool will then guide you through a series of prompts:

- **Target Repository:** Enter the owner and repository name (e.g., `BigByte-Digital/github-environment-cloner`).
- **Target Environment Name:** Specify the GitHub Actions environment you want to configure (e.g., `production`, `staging`). The tool will create it if it doesn't exist.
- **Source for Variables:** Choose whether to copy variables from another GitHub environment, import from a `.env` file, or skip.
- **Source for Secrets:** Choose whether to copy secret names from another GitHub environment (you'll be prompted for values), import names and values from a `.env` file, or skip.

Follow the on-screen instructions to complete the process.

## Development

- **Linting and Formatting:** This project uses BiomeJS for linting and formatting.

  ```bash
  # Check for linting issues
  pnpm lint

  # Format code
  pnpm format
  ```

- **Building:** To compile TypeScript to JavaScript (output to `dist` directory):
  ```bash
  pnpm build
  ```

## How it Works

1.  **User Input:** Gathers necessary information like repository details, target environment name, and source preferences for variables and secrets using the `prompts` library.
2.  **Environment Setup:** Checks if the target GitHub Actions environment exists. If not, it attempts to create it using the GitHub API.
3.  **Public Key Fetching:** For secret processing, it fetches the public key of the target environment. This key is essential for encrypting secrets before they are sent to GitHub, ensuring they are not exposed as plaintext.
4.  **Variable Processing:** Based on user choice, variables are either fetched from a source GitHub environment or read from a local `.env` file. These are then created or updated in the target environment.
5.  **Secret Processing:**
    - If copying from a source environment, only secret names are fetched. The user is then prompted to enter the value for each secret.
    - If importing from a file, both names and values are read.
    - Each secret value is encrypted using `libsodium-wrappers` and the target environment's public key before being sent to GitHub.
6.  **GitHub API Interaction:** Uses `@octokit/rest` to communicate with the GitHub API for all operations related to environments, variables, and secrets.

## Security Considerations

- **GitHub PAT:** Your `GITHUB_TOKEN` is sensitive. Ensure it is stored securely in the `.env` file and that `.env` is included in your `.gitignore`.
- **Secret Encryption:** Secrets are encrypted client-side before being transmitted to GitHub. This means the raw secret values are never logged or sent unencrypted over the network by this tool after you input them.
- **Prompting for Secret Values:** When copying secrets from another environment, the tool only copies names and then prompts you for the values. This is a security measure to avoid directly transferring potentially sensitive values without explicit user input.

## Code of Conduct

This project and everyone participating in it is governed by the [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## Contributing

Contributions are welcome! We value feedback and contributions from the community. Please feel free to submit a pull request or open an issue for any bugs, feature requests, or improvements.

For more detailed information on how to contribute, please see our [Contributing Guidelines](CONTRIBUTING.md).

## Changelog

Details of changes for each release are documented in the [CHANGELOG.md](CHANGELOG.md) file.

## License

ISC (This is the default from the initial `package.json`, you can change it if needed)

## Maintained By

This project is maintained by [BigByte Digital](https://bigbyte.digital). We build software for people like you, get in touch.
