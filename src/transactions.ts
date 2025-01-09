import axios from "axios";
import dotenv from "dotenv";
import { config } from "./config";
import { RugResponse } from "./types";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";

// Load environment variables from the .env file
dotenv.config();

// Initialize Solana connection
const connection = new Connection("https://api.mainnet-beta.solana.com");

export async function getRugCheck(tokenMint: string): Promise<RugResponse | false> {
  const rugResponse = await axios.get<RugResponse>("https://api.rugcheck.xyz/v1/tokens/" + tokenMint + "/report/summary", {
    timeout: config.settings.api_get_timeout,
  });

  if (!rugResponse.data) return false;

  if (config.rug_check.verbose_log && config.rug_check.verbose_log === true) {
    console.log(rugResponse.data);
  }

  return rugResponse.data;
}

// Generate a new payment address
export function generatePaymentAddress(): string {
  const keypair = Keypair.generate();
  return keypair.publicKey.toString();
}

// Verify payment
export async function verifyPayment(paymentAddress: string, expectedAmount: number): Promise<boolean> {
  try {
    console.log(`\n[Payment Check] Checking payment for address: ${paymentAddress}`);
    console.log(`[Payment Check] Expected amount: ${expectedAmount} SOL`);
    
    const publicKey = new PublicKey(paymentAddress);
    const balance = await connection.getBalance(publicKey);
    const solBalance = balance / 1e9; // Convert lamports to SOL
    
    console.log(`[Payment Check] Current balance: ${solBalance} SOL`);
    
    const isPaid = Math.abs(solBalance - expectedAmount) < 0.001;
    console.log(`[Payment Check] Payment status: ${isPaid ? 'PAID ✅' : 'PENDING ⏳'}`);
    
    return isPaid;
  } catch (error) {
    console.error('[Payment Check] Error verifying payment:', error);
    return false;
  }
}
