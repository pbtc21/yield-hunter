/**
 * Wallet Integration
 *
 * Compatible with @aibtc/mcp-server wallets stored in ~/.aibtc/
 * Allows yield-hunter to use existing wallets created via Claude.
 */

import fs from "fs/promises";
import path from "path";
import os from "os";
import crypto from "crypto";
import { generateWallet, getStxAddress } from "@stacks/wallet-sdk";
import { TransactionVersion } from "@stacks/transactions";

// ============================================
// TYPES
// ============================================

export interface WalletMetadata {
  id: string;
  name: string;
  address: string;
  network: "mainnet" | "testnet";
  createdAt: string;
  lastUsed?: string;
}

export interface Account {
  address: string;
  privateKey: string;
  network: "mainnet" | "testnet";
}

interface WalletIndex {
  wallets: WalletMetadata[];
}

interface KeystoreFile {
  version: number;
  encrypted: EncryptedData;
  addressIndex: number;
}

interface AppConfig {
  activeWalletId: string | null;
  autoLockTimeout: number;
}

// ============================================
// PATHS
// ============================================

const AIBTC_DIR = path.join(os.homedir(), ".aibtc");
const WALLETS_DIR = path.join(AIBTC_DIR, "wallets");
const INDEX_FILE = path.join(AIBTC_DIR, "wallets.json"); // Note: MCP uses wallets.json
const CONFIG_FILE = path.join(AIBTC_DIR, "config.json");

// ============================================
// ENCRYPTION (compatible with aibtc-mcp)
// Uses Scrypt + AES-256-GCM with base64 encoding
// ============================================

interface EncryptedData {
  ciphertext: string; // Base64
  iv: string; // Base64
  authTag: string; // Base64
  salt: string; // Base64
  scryptParams: {
    N: number;
    r: number;
    p: number;
    keyLen: number;
  };
  version: number;
}

async function deriveKey(
  password: string,
  salt: Buffer,
  params: EncryptedData["scryptParams"]
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      params.keyLen,
      { N: params.N, r: params.r, p: params.p },
      (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey);
      }
    );
  });
}

async function decrypt(encrypted: EncryptedData, password: string): Promise<string> {
  const ciphertext = Buffer.from(encrypted.ciphertext, "base64");
  const iv = Buffer.from(encrypted.iv, "base64");
  const authTag = Buffer.from(encrypted.authTag, "base64");
  const salt = Buffer.from(encrypted.salt, "base64");

  const key = await deriveKey(password, salt, encrypted.scryptParams);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  try {
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch {
    throw new Error("Invalid password");
  }
}

// ============================================
// WALLET FUNCTIONS
// ============================================

/**
 * Check if any wallets exist in ~/.aibtc/
 */
export async function hasWallets(): Promise<boolean> {
  try {
    const index = await readWalletIndex();
    return index.wallets.length > 0;
  } catch {
    return false;
  }
}

/**
 * List all available wallets
 */
export async function listWallets(): Promise<WalletMetadata[]> {
  try {
    const index = await readWalletIndex();
    return index.wallets;
  } catch {
    return [];
  }
}

/**
 * Get the active wallet ID
 */
export async function getActiveWalletId(): Promise<string | null> {
  try {
    const config = await readConfig();
    return config.activeWalletId;
  } catch {
    return null;
  }
}

/**
 * Unlock a wallet and return the account
 */
export async function unlockWallet(walletId: string, password: string): Promise<Account> {
  // Get wallet metadata
  const index = await readWalletIndex();
  const walletMeta = index.wallets.find((w) => w.id === walletId);

  if (!walletMeta) {
    throw new Error(`Wallet not found: ${walletId}`);
  }

  // Read keystore
  const keystorePath = path.join(WALLETS_DIR, walletId, "keystore.json");
  const keystoreContent = await fs.readFile(keystorePath, "utf8");
  const keystore: KeystoreFile = JSON.parse(keystoreContent);

  // Decrypt mnemonic
  let mnemonic: string;
  try {
    mnemonic = await decrypt(keystore.encrypted, password);
  } catch {
    throw new Error("Invalid password");
  }

  // Generate account from mnemonic
  const wallet = await generateWallet({
    secretKey: mnemonic,
    password: "",
  });

  const stacksAccount = wallet.accounts[0];
  const transactionVersion = walletMeta.network === "mainnet"
    ? TransactionVersion.Mainnet
    : TransactionVersion.Testnet;
  const address = getStxAddress({ account: stacksAccount, transactionVersion });

  return {
    address,
    privateKey: stacksAccount.stxPrivateKey,
    network: walletMeta.network,
  };
}

/**
 * Prompt for wallet password (stdin)
 */
export async function promptPassword(prompt = "Enter wallet password: "): Promise<string> {
  // For non-TTY (piped input), read line directly
  if (!process.stdin.isTTY) {
    process.stdout.write(prompt);
    return new Promise((resolve) => {
      let data = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => {
        data += chunk;
        if (data.includes("\n")) {
          resolve(data.trim());
        }
      });
      process.stdin.on("end", () => resolve(data.trim()));
      process.stdin.resume();
    });
  }

  // For TTY, use raw mode to hide password
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    process.stdin.setRawMode(true);

    let password = "";

    const onData = (chunk: Buffer) => {
      const char = chunk.toString();

      if (char === "\n" || char === "\r" || char === "\u0003") {
        process.stdin.removeListener("data", onData);
        process.stdin.setRawMode(false);
        console.log(); // New line after password

        if (char === "\u0003") {
          process.exit(0);
        }

        resolve(password);
      } else if (char === "\u007F" || char === "\b") {
        // Backspace
        password = password.slice(0, -1);
      } else {
        password += char;
      }
    };

    process.stdin.resume();
    process.stdin.on("data", onData);
  });
}

// ============================================
// FILE HELPERS
// ============================================

async function readWalletIndex(): Promise<WalletIndex> {
  const content = await fs.readFile(INDEX_FILE, "utf8");
  return JSON.parse(content);
}

async function readConfig(): Promise<AppConfig> {
  try {
    const content = await fs.readFile(CONFIG_FILE, "utf8");
    return JSON.parse(content);
  } catch {
    return { activeWalletId: null, autoLockTimeout: 60 };
  }
}
