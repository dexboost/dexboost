import { getDb } from '../db';

async function migrate() {
    const db = await getDb();
    try {
        // Create temporary table
        await db.run(`
            CREATE TABLE pin_orders_temp (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tokenAddress TEXT NOT NULL,
                hours INTEGER NOT NULL,
                cost REAL NOT NULL,
                paymentAddress TEXT NOT NULL,
                paymentPrivateKey TEXT,
                status TEXT NOT NULL,
                createdAt INTEGER NOT NULL,
                expiresAt INTEGER NOT NULL,
                userIp TEXT DEFAULT 'unknown'
            )
        `);

        // Copy data
        await db.run(`
            INSERT INTO pin_orders_temp 
            SELECT id, tokenAddress, hours, cost, paymentAddress, paymentPrivateKey, 
                   status, createdAt, expiresAt, COALESCE(userIp, 'unknown')
            FROM pin_orders
        `);

        // Drop old table
        await db.run('DROP TABLE pin_orders');

        // Rename new table
        await db.run('ALTER TABLE pin_orders_temp RENAME TO pin_orders');

        console.log('Migration completed successfully');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await db.close();
    }
}

migrate(); 