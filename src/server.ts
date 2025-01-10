import express from "express";
import type { Application, Request, Response, RequestHandler } from "express";
import type { ParamsDictionary } from "express-serve-static-core";
import { Server, createServer } from 'http';
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

type TypedRequestBody<T> = Request<ParamsDictionary, any, T>;
type TypedRequestParams<P extends ParamsDictionary> = Request<P>;

const app: Application = express();
const server: Server = createServer(app);
const wss = new WebSocketServer({ server });

// Get CORS origins from environment or use defaults
const corsOrigins = process.env.CORS_ORIGINS ? 
    process.env.CORS_ORIGINS.split(',') : 
    ['http://localhost:5173', 'http://localhost:3000', 'https://dexboost.xyz'];

// Configure CORS
const corsOptions = {
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    optionsSuccessStatus: 200
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Enable pre-flight requests for all routes
app.options('*', cors(corsOptions));

app.use(express.json() as RequestHandler);

// Create pin order endpoint
app.post('/api/pin-order', async (req: Request, res: Response) => {
    const { tokenAddress, hours, cost } = req.body;
    const userIp = req.ip || req.socket.remoteAddress || 'unknown';

    try {
        const order = await createPinOrder(tokenAddress, hours, cost, userIp);
        res.json(order);
    } catch (error: any) {
        console.error('Error creating pin order:', error);
        res.status(400).json({ error: error.message || 'Unknown error occurred' });
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