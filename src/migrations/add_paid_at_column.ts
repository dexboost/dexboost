import { getDb } from '../db';

async function migrate() {
    const db = await getDb();
    try {
        await db.run(`
            ALTER TABLE pin_orders 
            ADD COLUMN paidAt INTEGER;
        `);
        
        console.log('Added paidAt column successfully');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await db.close();
    }
}

migrate(); 