import { getDb } from '../db';

async function migrate() {
  const db = await getDb();
  try {
    // Add paymentPrivateKey column if it doesn't exist
    await db.run(`
      ALTER TABLE pin_orders 
      ADD COLUMN paymentPrivateKey TEXT NOT NULL DEFAULT '';
    `);
    
    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await db.close();
  }
}

migrate(); 