import * as fs from "fs/promises";
import { parse as dotenvParse } from "dotenv"; // Changed to named import for clarity
import type { Variable } from "./types.js"; // Added .js and made import type-only

export async function parseEnvFile(
  filePath: string
): Promise<Variable[] | null> {
  try {
    const fileContent = await fs.readFile(filePath, { encoding: "utf8" });
    const parsed = dotenvParse(fileContent); // Use imported parse
    return Object.entries(parsed).map(([name, value]) => ({
      name,
      value: value as string,
    }));
  } catch (error: any) {
    if (error.code === "ENOENT") {
      console.warn(`⚠️ File not found at '${filePath}'.`);
    } else {
      console.error(
        `Error reading or parsing file at '${filePath}': ${error.message}`
      );
    }
    return null;
  }
}
