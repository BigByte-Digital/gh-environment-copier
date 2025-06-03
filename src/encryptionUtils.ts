import sodium from "libsodium-wrappers";

export async function encryptSecret(
  value: string,
  environment_public_key: string
): Promise<string> {
  await sodium.ready; // Ensure libsodium is ready
  const secretValueBytes = Buffer.from(value);
  const publicKeyBytes = Buffer.from(environment_public_key, "base64");

  // Encrypt the secret using libsodium
  const encryptedBytes = sodium.crypto_box_seal(
    secretValueBytes,
    publicKeyBytes
  );
  return Buffer.from(encryptedBytes).toString("base64");
}
