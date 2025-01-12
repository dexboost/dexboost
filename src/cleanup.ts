import { deleteNonPumpFunTokens } from './db';

async function cleanup() {
    console.log('Starting cleanup of non-PumpFun tokens...');
    
    const success = await deleteNonPumpFunTokens();
    
    if (success) {
        console.log('Cleanup completed successfully');
    } else {
        console.error('Cleanup failed');
        process.exit(1);
    }
    
    process.exit(0);
}

cleanup(); 