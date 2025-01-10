import { config } from "./config";
import { startHunter } from "./hunter";
import { server, wss } from "./server";
import { getTokenVotes, getUserVote, upsertVote, createPinOrder, getPinOrderStatus, getPendingOrders, updateOrderStatus, updateTokenPin, checkAndExpirePins } from "./db";
import { verifyPayment } from "./transactions";

// WebSocket connection handling
wss.on('connection', (ws) => {
    console.log('Client connected');
    
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
    
    ws.on('close', () => console.log('Client disconnected'));
});

// Function to broadcast updates to all connected clients
export function broadcast(data: any) {
    wss.clients.forEach((client) => {
        if (client.readyState === 1) { // WebSocket.OPEN
            try {
                client.send(JSON.stringify(data));
            } catch (error) {
                console.error('Error broadcasting to client:', error);
            }
        }
    });
}

// Background job to process payments and check pin expiration
async function processPayments() {
    try {
        const pendingOrders = await getPendingOrders();
        
        if (pendingOrders.length > 0) {
            console.log('\n[Payment System] Processing pending orders...');
        }
        
        for (const order of pendingOrders) {
            // Check if order is expired
            if (order.expiresAt < Date.now()) {
                console.log(`[Payment System] Order ${order.id} has expired ❌`);
                await updateOrderStatus(order.id, 'expired');
                continue;
            }

            // Verify payment
            const isPaid = await verifyPayment(order.paymentAddress, order.cost);
            if (isPaid) {
                console.log(`[Payment System] Order ${order.id} payment confirmed ✅`);
                
                // Update order status
                await updateOrderStatus(order.id, 'paid', Date.now());
                console.log(`[Payment System] Order ${order.id} marked as paid`);
                
                // Update token pin status
                await updateTokenPin(order.tokenAddress, order.hours);
                console.log(`[Payment System] Token ${order.tokenAddress} pinned for ${order.hours} hours`);
                
                // Mark order as completed
                await updateOrderStatus(order.id, 'completed');
                console.log(`[Payment System] Order ${order.id} completed successfully ✨`);
                
                // Broadcast update
                broadcast({
                    type: 'PIN_UPDATE',
                    tokenAddress: order.tokenAddress,
                    pinned: true
                });
            }
        }

        // Check for expired pins
        await checkAndExpirePins();
    } catch (error) {
        console.error('[Payment System] Error processing payments:', error);
    }
}

// Run payment processing and pin expiration check every 30 seconds
setInterval(processPayments, 30000);

// Start the hunter
startHunter();

console.log('Started. Waiting for tokens...'); 