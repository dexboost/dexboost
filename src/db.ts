import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { config } from "./config";
import { boostAmounts, TokenResponseType, updatedDetailedTokenType } from "./types";
import { broadcast } from './index.js';
import { Keypair } from '@solana/web3.js';

// Helper function to get database connection
async function getDb() {
    const db = await open({
        filename: config.settings.db_name_tracker,
        driver: sqlite3.Database
    });

    // Create tokens table if it doesn't exist
    await db.exec(`
        CREATE TABLE IF NOT EXISTS tokens (
            tokenName TEXT,
            tokenAddress TEXT PRIMARY KEY,
            url TEXT,
            chainId TEXT,
            icon TEXT,
            header TEXT,
            openGraph TEXT,
            description TEXT,
            marketCap REAL,
            amount INTEGER,
            totalAmount INTEGER,
            pairsAvailable INTEGER,
            dexPair TEXT,
            currentPrice REAL,
            liquidity REAL,
            pairCreatedAt INTEGER,
            tokenSymbol TEXT,
            volume24h REAL,
            volume6h REAL,
            volume1h REAL,
            links TEXT,
            boosted INTEGER,
            dateAdded INTEGER,
            pinnedUntil INTEGER DEFAULT 0
        )
    `);

    // Create orders table
    await db.exec(`
        CREATE TABLE IF NOT EXISTS pin_orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tokenAddress TEXT NOT NULL,
            hours INTEGER NOT NULL,
            cost REAL NOT NULL,
            status TEXT NOT NULL, -- 'pending', 'paid', 'expired', 'completed'
            paymentAddress TEXT NOT NULL,
            paymentPrivateKey TEXT NOT NULL,
            createdAt INTEGER NOT NULL,
            paidAt INTEGER,
            expiresAt INTEGER NOT NULL,
            userIp TEXT NOT NULL
        )
    `);

    // Add dateAdded column if it doesn't exist
    try {
        await db.exec(`ALTER TABLE tokens ADD COLUMN dateAdded INTEGER`);
    } catch (error) {
        // Column might already exist, ignore the error
    }

    // Create votes table if it doesn't exist
    await db.exec(`
        CREATE TABLE IF NOT EXISTS votes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tokenAddress TEXT,
            userIp TEXT,
            vote INTEGER, -- 1 for upvote, -1 for downvote
            timestamp INTEGER,
            UNIQUE(tokenAddress, userIp)
        )
    `);

    return db;
}

// Tokens
export async function createTokensTable(database: any): Promise<boolean> {
  try {
    await database.exec(`
      CREATE TABLE IF NOT EXISTS tokens (
        tokenName TEXT,
        tokenAddress TEXT PRIMARY KEY,
        icon TEXT,
        marketCap REAL,
        amount INTEGER,
        totalAmount INTEGER,
        pairsAvailable INTEGER,
        dexPair TEXT,
        currentPrice REAL,
        liquidity REAL,
        pairCreatedAt INTEGER,
        tokenSymbol TEXT,
        volume24h REAL,
        volume6h REAL,
        volume1h REAL,
        links TEXT,
        boosted INTEGER
      );
    `);
    return true;
  } catch (error: any) {
    console.error("Error creating TokenData table:", error);
    return false;
  }
}
export async function selectAllTokens() {
    const db = await getDb();
    try {
        const tokens = await db.all("SELECT * FROM tokens ORDER BY boosted DESC");
        return tokens;
    } catch (error) {
        console.error("Error selecting all tokens:", error);
        return null;
    } finally {
        await db.close();
    }
}
export async function upsertTokenBoost(token: updatedDetailedTokenType): Promise<boolean> {
    const db = await getDb();
    const recordAdded = Date.now();

    try {
        // First check if token exists
        const existingToken = await db.get('SELECT tokenAddress, dateAdded FROM tokens WHERE tokenAddress = ?', [token.tokenAddress]);
        const dateAdded = existingToken ? existingToken.dateAdded : recordAdded; // Keep existing dateAdded or set new one

        const result = await db.run(
            `INSERT INTO tokens (
                tokenName, tokenAddress, url, chainId, icon, header, openGraph,
                description, marketCap, amount, totalAmount, pairsAvailable,
                dexPair, currentPrice, liquidity, pairCreatedAt, tokenSymbol,
                volume24h, volume6h, volume1h, links, boosted, dateAdded
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(tokenAddress) DO UPDATE SET
                tokenName=excluded.tokenName,
                url=excluded.url,
                chainId=excluded.chainId,
                icon=excluded.icon,
                header=excluded.header,
                openGraph=excluded.openGraph,
                description=excluded.description,
                marketCap=excluded.marketCap,
                amount=excluded.amount,
                totalAmount=excluded.totalAmount,
                pairsAvailable=excluded.pairsAvailable,
                dexPair=excluded.dexPair,
                currentPrice=excluded.currentPrice,
                liquidity=excluded.liquidity,
                pairCreatedAt=excluded.pairCreatedAt,
                tokenSymbol=excluded.tokenSymbol,
                volume24h=excluded.volume24h,
                volume6h=excluded.volume6h,
                volume1h=excluded.volume1h,
                links=excluded.links,
                boosted=excluded.boosted,
                dateAdded=COALESCE((SELECT dateAdded FROM tokens WHERE tokenAddress=excluded.tokenAddress), excluded.dateAdded)`,
            [
                token.tokenName,
                token.tokenAddress,
                token.url,
                token.chainId,
                token.icon,
                token.header,
                token.openGraph,
                token.description,
                token.marketCap,
                token.amount,
                token.totalAmount,
                token.pairsAvailable,
                token.dexPair,
                token.currentPrice,
                token.liquidity,
                token.pairCreatedAt,
                token.tokenSymbol,
                token.volume24h,
                token.volume6h,
                token.volume1h,
                JSON.stringify(token.links),
                recordAdded,
                dateAdded
            ]
        );

        if (result && typeof result.changes === 'number' && result.changes > 0) {
            const updatedToken = {
                ...token,
                boosted: recordAdded
            };
            broadcast(updatedToken);
            return true;
        }

        return false;
    } catch (error) {
        console.error('Error upserting token boost:', error);
        return false;
    }
}
export async function selectTokenPresent(token: string): Promise<boolean> {
    const db = await getDb();
    try {
        const tokenExists = await db.get(`SELECT tokenAddress FROM tokens WHERE tokenAddress = ?`, [token]);
        return !!tokenExists;
    } catch (error) {
        console.error("Error checking token presence:", error);
        return false;
    } finally {
        await db.close();
    }
}
export async function selectTokenBoostAmounts(token: string): Promise<false | boostAmounts> {
    const db = await getDb();
    try {
        const tokenAmounts = await db.get(
            `SELECT amount, totalAmount FROM tokens WHERE tokenAddress = ?`,
            [token]
        );

        if (tokenAmounts) {
            const amount = tokenAmounts.amount || 0;
            const amountTotal = tokenAmounts.totalAmount || 0;
            return { amount, amountTotal };
        }
        return false;
    } catch (error) {
        console.error("Error getting token boost amounts:", error);
        return false;
    } finally {
        await db.close();
    }
}
export async function selectLatestUpdatedToken() {
    const db = await getDb();
    try {
        const latestToken = await db.get(`
            SELECT * FROM tokens 
            ORDER BY boosted DESC 
            LIMIT 1
        `);
        return latestToken;
    } catch (error) {
        console.error("Error getting latest token:", error);
        return null;
    } finally {
        await db.close();
    }
}

// Get vote count for a token
export async function getTokenVotes(tokenAddress: string): Promise<{ upvotes: number; downvotes: number }> {
    const db = await getDb();
    try {
        const upvotes = await db.get(
            `SELECT COUNT(*) as count FROM votes WHERE tokenAddress = ? AND vote = 1`,
            [tokenAddress]
        );
        const downvotes = await db.get(
            `SELECT COUNT(*) as count FROM votes WHERE tokenAddress = ? AND vote = -1`,
            [tokenAddress]
        );
        return {
            upvotes: upvotes.count || 0,
            downvotes: downvotes.count || 0
        };
    } catch (error) {
        console.error("Error getting token votes:", error);
        return { upvotes: 0, downvotes: 0 };
    } finally {
        await db.close();
    }
}

// Add or update a vote
export async function upsertVote(tokenAddress: string, userIp: string, vote: 1 | -1): Promise<boolean> {
    const db = await getDb();
    try {
        await db.run(
            `INSERT INTO votes (tokenAddress, userIp, vote, timestamp)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(tokenAddress, userIp) DO UPDATE SET
             vote = excluded.vote,
             timestamp = excluded.timestamp`,
            [tokenAddress, userIp, vote, Date.now()]
        );
        
        // Get updated vote counts
        const votes = await getTokenVotes(tokenAddress);
        
        // Broadcast the update
        broadcast({
            type: 'VOTE_UPDATE',
            tokenAddress,
            votes
        });
        
        return true;
    } catch (error) {
        console.error("Error upserting vote:", error);
        return false;
    } finally {
        await db.close();
    }
}

// Get user's vote for a token
export async function getUserVote(tokenAddress: string, userIp: string): Promise<number | null> {
    const db = await getDb();
    try {
        const result = await db.get(
            `SELECT vote FROM votes WHERE tokenAddress = ? AND userIp = ?`,
            [tokenAddress, userIp]
        );
        return result ? result.vote : null;
    } catch (error) {
        console.error("Error getting user vote:", error);
        return null;
    } finally {
        await db.close();
    }
}

// Create a new pin order
export async function createPinOrder(tokenAddress: string, hours: number, cost: number): Promise<any> {
  if (!(await canTokenBePinned())) {
    throw new Error('Maximum number of pinned tokens reached (3). Please wait for a pin to expire.');
  }

  const db = await getDb();
  try {
    const paymentAddress = generatePaymentAddress(); // You should implement this function
    const now = Date.now();
    const expiresAt = now + (30 * 60 * 1000); // 30 minutes to pay

    const result = await db.run(
      `INSERT INTO pin_orders (tokenAddress, hours, cost, paymentAddress, status, createdAt, expiresAt)
       VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
      [tokenAddress, hours, cost, paymentAddress, now, expiresAt]
    );

    return {
      id: result.lastID,
      paymentAddress,
      expiresAt
    };
  } catch (error) {
    console.error('Error creating pin order:', error);
    throw error;
  } finally {
    await db.close();
  }
}

// Get order status
export async function getPinOrderStatus(orderId: number): Promise<any> {
    const db = await getDb();
    try {
        const order = await db.get(
            'SELECT id, tokenAddress, hours, cost, status, paymentAddress, createdAt, paidAt, expiresAt FROM pin_orders WHERE id = ?',
            [orderId]
        );
        return order;
    } catch (error) {
        console.error('Error getting pin order status:', error);
        return null;
    } finally {
        await db.close();
    }
}

// Get pending orders
export async function getPendingOrders(): Promise<any[]> {
    const db = await getDb();
    try {
        const orders = await db.all(
            `SELECT id, tokenAddress, hours, cost, paymentAddress, createdAt, expiresAt 
             FROM pin_orders 
             WHERE status = 'pending' AND expiresAt > ?`,
            [Date.now()]
        );
        return orders;
    } catch (error) {
        console.error('Error getting pending orders:', error);
        return [];
    } finally {
        await db.close();
    }
}

// Update order status
export async function updateOrderStatus(
  orderId: number, 
  status: 'pending' | 'paid' | 'expired' | 'completed' | 'refund_needed', 
  paidAt?: number
): Promise<boolean> {
  const db = await getDb();
  try {
    await db.run(
      `UPDATE pin_orders 
       SET status = ?, paidAt = ? 
       WHERE id = ?`,
      [status, paidAt || null, orderId]
    );
    return true;
  } catch (error) {
    console.error('Error updating order status:', error);
    return false;
  } finally {
    await db.close();
  }
}

// Update token pin status
export async function updateTokenPin(tokenAddress: string, hours: number): Promise<boolean> {
    const db = await getDb();
    const now = Date.now();
    const pinnedUntil = now + (hours * 60 * 60 * 1000);
    try {
        await db.run(
            `UPDATE tokens 
             SET boosted = ?, 
                 amount = amount + 1,
                 totalAmount = totalAmount + 1,
                 pinnedUntil = ?
             WHERE tokenAddress = ?`,
            [now, pinnedUntil, tokenAddress]
        );
        return true;
    } catch (error) {
        console.error('Error updating token pin:', error);
        return false;
    } finally {
        await db.close();
    }
}

// Add a function to check and expire pins
export async function checkAndExpirePins(): Promise<void> {
    const db = await getDb();
    const now = Date.now();
    try {
        // Get tokens with expired pins
        const expiredTokens = await db.all(
            `SELECT tokenAddress FROM tokens 
             WHERE pinnedUntil > 0 AND pinnedUntil < ?`,
            [now]
        );

        // Reset pinnedUntil for expired tokens
        if (expiredTokens.length > 0) {
            await db.run(
                `UPDATE tokens 
                 SET pinnedUntil = 0 
                 WHERE pinnedUntil > 0 AND pinnedUntil < ?`,
                [now]
            );

            // Broadcast updates for expired pins
            expiredTokens.forEach(token => {
                broadcast({
                    type: 'PIN_EXPIRED',
                    tokenAddress: token.tokenAddress
                });
            });
        }
    } catch (error) {
        console.error('Error checking pin expiration:', error);
    } finally {
        await db.close();
    }
}

// Get count of currently pinned tokens
export async function getPinnedTokensCount(): Promise<number> {
  const db = await getDb();
  try {
    const result = await db.get(
      `SELECT COUNT(*) as count 
       FROM tokens 
       WHERE pinnedUntil > ?`,
      [Date.now()]
    );
    return result.count;
  } catch (error) {
    console.error('Error getting pinned tokens count:', error);
    return 0;
  } finally {
    await db.close();
  }
}

// Check if token can be pinned
export async function canTokenBePinned(): Promise<boolean> {
  const pinnedCount = await getPinnedTokensCount();
  return pinnedCount < 3;
}
