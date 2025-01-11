const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { config } = require('../config');

async function getDb() {
    return await open({
        filename: config.settings.db_name_tracker,
        driver: sqlite3.Database
    });
}

async function migrate() {
    const db = await getDb();
    try {
        // Drop existing votes table
        await db.run('DROP TABLE IF EXISTS votes');
        
        // Create new votes table with userId and unique constraint
        await db.run(`
            CREATE TABLE IF NOT EXISTS votes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tokenAddress TEXT NOT NULL,
                userId TEXT NOT NULL,
                vote INTEGER NOT NULL CHECK (vote IN (1, -1)),
                timestamp INTEGER NOT NULL,
                UNIQUE(tokenAddress, userId)
            );
        `);
        
        console.log('Updated votes table successfully');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await db.close();
    }
}

migrate(); 