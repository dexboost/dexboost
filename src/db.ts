import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { config } from "./config";
import { boostAmounts, TokenResponseType, updatedDetailedTokenType } from "./types";
import { broadcast } from './index';
import { Keypair } from '@solana/web3.js';

// Helper function to get database connection
export async function getDb() {
    return await open({
        filename: config.settings.db_name_tracker,
        driver: sqlite3.Database
    });
}

// Initialize all database tables
export async function initializeDatabase(): Promise<void> {
    const db = await getDb();
    try {
        // Create tokens table
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
                amount INTEGER DEFAULT 0,
                totalAmount INTEGER DEFAULT 0,
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
                pinnedUntil INTEGER
            );
        `);

        await db.exec(`
            CREATE TABLE IF NOT EXISTS votes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tokenAddress TEXT NOT NULL,
                userId TEXT NOT NULL,
                vote INTEGER NOT NULL CHECK (vote IN (1, -1)),
                timestamp INTEGER NOT NULL,
                UNIQUE(tokenAddress, userId)
            );
        `);


        await db.exec(`
            CREATE TABLE IF NOT EXISTS pin_orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tokenAddress TEXT NOT NULL,
                hours INTEGER NOT NULL,
                cost REAL NOT NULL,
                paymentAddress TEXT NOT NULL,
                paymentPrivateKey TEXT NOT NULL,
                status TEXT NOT NULL,
                createdAt INTEGER NOT NULL,
                expiresAt INTEGER NOT NULL,
                paidAt INTEGER,
                userIp TEXT DEFAULT 'unknown'
            );
        `);

        console.log('All database tables initialized successfully');
    } catch (error) {
        console.error('Error initializing database:', error);
        throw error;
    } finally {
        await db.close();
    }
}

// Tokens
export async function createTokensTable(database: any): Promise<boolean> {
    try {
        await database.exec(`
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
                amount INTEGER DEFAULT 0,
                totalAmount INTEGER DEFAULT 0,
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
                pinnedUntil INTEGER
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
            // Get the complete token data including all fields
            const updatedToken = await db.get('SELECT * FROM tokens WHERE tokenAddress = ?', [token.tokenAddress]);
            if (updatedToken) {
                // Parse links back to object
                updatedToken.links = JSON.parse(updatedToken.links);
                
                // Broadcast with type based on whether it's a new token or update
                broadcast({
                    type: existingToken ? 'update' : 'NEW_TOKEN',
                    token: updatedToken
                });
            }
            return true;
        }

        return false;
    } catch (error) {
        console.error('Error upserting token boost:', error);
        return false;
    } finally {
        await db.close();
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
export async function upsertVote(tokenAddress: string, userId: string, vote: 1 | -1): Promise<boolean> {
    const db = await getDb();
    try {
        // First try to insert
        try {
            await db.run(
                `INSERT INTO votes (tokenAddress, userId, vote, timestamp)
                 VALUES (?, ?, ?, ?)`,
                [tokenAddress, userId, vote, Date.now()]
            );
        } catch (err) {
            // If insert fails due to unique constraint, update instead
            await db.run(
                `UPDATE votes 
                 SET vote = ?, timestamp = ?
                 WHERE tokenAddress = ? AND userId = ?`,
                [vote, Date.now(), tokenAddress, userId]
            );
        }
        
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
export async function getUserVote(tokenAddress: string, userId: string): Promise<number | null> {
    const db = await getDb();
    try {
        const result = await db.get(
            `SELECT vote FROM votes WHERE tokenAddress = ? AND userId = ?`,
            [tokenAddress, userId]
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
export async function createPinOrder(
    tokenAddress: string, 
    hours: number, 
    cost: number,
    userIp: string
): Promise<any> {
    const db = await getDb();
    try {
        // Generate payment keypair
        const keypair = Keypair.generate();
        const paymentAddress = keypair.publicKey.toString();
        const paymentPrivateKey = Buffer.from(keypair.secretKey).toString('base64');

        const now = Date.now();
        const expiresAt = now + (30 * 60 * 1000); // 30 minutes to pay

        const result = await db.run(
            `INSERT INTO pin_orders (
                tokenAddress, 
                hours, 
                cost, 
                paymentAddress, 
                paymentPrivateKey,
                status, 
                createdAt, 
                expiresAt,
                userIp
            ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
            [
                tokenAddress, 
                hours, 
                cost, 
                paymentAddress, 
                paymentPrivateKey,
                now, 
                expiresAt,
                userIp
            ]
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
        return await db.all(
            `SELECT * FROM pin_orders 
             WHERE status = 'pending' 
             AND expiresAt > ?`,
            [Date.now()]
        );
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
    try {
        // Get current pin status
        const currentToken = await db.get(
            'SELECT pinnedUntil FROM tokens WHERE tokenAddress = ?',
            [tokenAddress]
        );

        // Calculate new pin expiry time
        const currentPinnedUntil = currentToken?.pinnedUntil || 0;
        const baseTime = currentPinnedUntil > now ? currentPinnedUntil : now;
        const newPinnedUntil = baseTime + (hours * 60 * 60 * 1000);

        await db.run(
            `UPDATE tokens 
             SET boosted = ?, 
                 amount = amount + 1,
                 totalAmount = totalAmount + 1,
                 pinnedUntil = ?
             WHERE tokenAddress = ?`,
            [now, newPinnedUntil, tokenAddress]
        );

        // Get updated token data and broadcast
        const updatedToken = await db.get('SELECT * FROM tokens WHERE tokenAddress = ?', [tokenAddress]);
        if (updatedToken) {
            broadcast({
                type: 'BOOST_UPDATE',
                token: updatedToken
            });
        }

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
    try {
        const now = Date.now();
        await db.run(
            `UPDATE pin_orders 
             SET status = 'expired' 
             WHERE status = 'paid' 
             AND paidAt + (hours * 3600 * 1000) < ?`,
            [now]
        );
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
  return true; // Allow unlimited pins
}

// Generate a new Solana address for payments
function generatePaymentAddress(): string {
  const keypair = Keypair.generate();
  return keypair.publicKey.toString();
}

// Update order status and set paidAt timestamp
export async function markOrderAsPaid(orderId: number): Promise<void> {
    const db = await getDb();
    try {
        const now = Date.now();
        await db.run(
            `UPDATE pin_orders 
             SET status = 'paid', paidAt = ? 
             WHERE id = ?`,
            [now, orderId]
        );
    } finally {
        await db.close();
    }
}
