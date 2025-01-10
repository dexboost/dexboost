import express from "express";
import type { Application, Request, Response, RequestHandler } from "express";
import { Server } from 'http';
import cors from "cors";
import { WebSocketServer, WebSocket } from 'ws';
import { 
  selectAllTokens, 
  createPinOrder, 
  getPinOrderStatus, 
  getTokenVotes, 
  getUserVote, 
  upsertVote,
  getPendingOrders,
  updateOrderStatus,
  updateTokenPin,
  canTokenBePinned
} from "./db";
import { verifyPayment } from "./transactions";
import dotenv from 'dotenv';

// Load environment variables based on NODE_ENV
dotenv.config({
  path: process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development'
});

interface TypedRequestBody<T> extends Request {
  body: T;
}

interface TypedRequestParams<P> extends Request<P> {
  params: P;
}

const app: Application = express();
const PORT = process.env.PORT || 3000;
const server: Server = app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
const wss = new WebSocketServer({ server });

// Default CORS origins if not specified in environment
const defaultOrigins = ['http://localhost:5173', 'http://localhost:3000'];
const corsOrigins = process.env.CORS_ORIGINS ? 
  process.env.CORS_ORIGINS.split(',').filter(Boolean) : 
  defaultOrigins;

// Enable CORS and JSON parsing middleware
const corsMiddleware = cors({
  origin: corsOrigins,
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
}) as RequestHandler;

app.use(corsMiddleware);
app.use(express.json() as RequestHandler);

// Create pin order endpoint
app.post('/api/pin-order', async (
  req: TypedRequestBody<{ tokenAddress: string; hours: number; cost: number }>,
  res: Response
) => {
  const { tokenAddress, hours, cost } = req.body;

  if (!tokenAddress || !hours || !cost) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    const order = await createPinOrder(tokenAddress, hours, cost);
    res.json(order);
  } catch (error) {
    console.error('Error creating pin order:', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to create pin order' });
  }
});

// Add background job to check pending payments
setInterval(async () => {
  try {
    const pendingOrders = await getPendingOrders();
    
    for (const order of pendingOrders) {
      const isPaid = await verifyPayment(order.paymentAddress, order.cost);
      
      if (isPaid) {
        // Check if we can still pin the token (in case limit was reached while payment was pending)
        if (await canTokenBePinned()) {
          await updateOrderStatus(order.id, 'paid', Date.now());
          await updateTokenPin(order.tokenAddress, order.hours);
          // Broadcast pin update
          wss.clients.forEach((client: WebSocket) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'PIN_UPDATE',
                tokenAddress: order.tokenAddress
              }));
            }
          });
        } else {
          // Refund needed - token can't be pinned anymore
          await updateOrderStatus(order.id, 'refund_needed');
          console.log(`[Payment Check] Refund needed for order ${order.id} - maximum pins reached`);
        }
      } else if (order.expiresAt < Date.now()) {
        await updateOrderStatus(order.id, 'expired');
      }
    }
  } catch (error) {
    console.error('Error checking pending payments:', error);
  }
}, 10000); // Check every 10 seconds

// Get all tokens endpoint
app.get("/api/tokens", async (_req: Request, res: Response) => {
    try {
        const tokens = await selectAllTokens();
        res.json(tokens);
    } catch (error) {
        console.error("Error fetching tokens:", error);
        res.status(500).json({ error: "Failed to fetch tokens" });
    }
});

// Add voting endpoint
app.post('/api/vote', async (
  req: TypedRequestBody<{ tokenAddress: string; vote: 1 | -1 }>,
  res: Response
) => {
    const { tokenAddress, vote } = req.body;
    const userIp = req.ip || req.socket.remoteAddress || 'unknown';

    if (!tokenAddress || ![1, -1].includes(vote)) {
        return res.status(400).json({ error: 'Invalid vote parameters' });
    }

    try {
        // Check if user has already voted
        const existingVote = await getUserVote(tokenAddress, userIp);
        if (existingVote !== null) {
            return res.status(400).json({ error: 'You have already voted for this token' });
        }

        const success = await upsertVote(tokenAddress, userIp, vote);
        if (success) {
            const votes = await getTokenVotes(tokenAddress);
            res.json(votes);
        } else {
            res.status(500).json({ error: 'Failed to save vote' });
        }
    } catch (error) {
        console.error('Error handling vote:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get user's vote endpoint
app.get('/api/vote/:tokenAddress', async (
  req: TypedRequestParams<{ tokenAddress: string }>,
  res: Response
) => {
    const { tokenAddress } = req.params;
    const userIp = req.ip || req.socket.remoteAddress || 'unknown';

    try {
        const vote = await getUserVote(tokenAddress, userIp);
        const votes = await getTokenVotes(tokenAddress);
        res.json({ userVote: vote, votes });
    } catch (error) {
        console.error('Error getting vote:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get pin order status endpoint
app.get('/api/pin-order/:orderId', async (
  req: TypedRequestParams<{ orderId: string }>,
  res: Response
) => {
    const { orderId } = req.params;

    try {
        const order = await getPinOrderStatus(parseInt(orderId));
        if (order) {
            res.json(order);
        } else {
            res.status(404).json({ error: 'Order not found' });
        }
    } catch (error) {
        console.error('Error getting pin order status:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export { app, server, wss }; 