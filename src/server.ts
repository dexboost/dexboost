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
  canTokenBePinned,
  getDb,
  initializeDatabase
} from "./db";
import { verifyPayment } from "./transactions";
import dotenv from 'dotenv';

// Load environment variables based on NODE_ENV
dotenv.config({
  path: process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development'
});

// Initialize database before starting the server
initializeDatabase().catch(error => {
  console.error('Failed to initialize database:', error);
  process.exit(1);
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
          
          // Get updated token data
          const tokens = await selectAllTokens();
          if (tokens) {
            const updatedToken = tokens.find(t => t.tokenAddress === order.tokenAddress);
            
            // Broadcast pin update with full token data
            wss.clients.forEach((client: WebSocket) => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: 'PIN_UPDATE',
                  token: updatedToken
                }));
              }
            });
          }
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
  req: TypedRequestBody<{ tokenAddress: string; vote: 1 | -1; userId: string }>,
  res: Response
) => {
    const { tokenAddress, vote, userId } = req.body;

    if (!tokenAddress || ![1, -1].includes(vote) || !userId) {
        return res.status(400).json({ error: 'Invalid vote parameters' });
    }

    try {
        // Check if user has already voted
        const existingVote = await getUserVote(tokenAddress, userId);
        if (existingVote !== null) {
            return res.status(400).json({ error: 'You have already voted for this token' });
        }

        const success = await upsertVote(tokenAddress, userId, vote);
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
app.get('/api/vote/:tokenAddress/:userId', async (
  req: TypedRequestParams<{ tokenAddress: string; userId: string }>,
  res: Response
) => {
    const { tokenAddress, userId } = req.params;

    try {
        const vote = await getUserVote(tokenAddress, userId);
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

// Get all votes endpoint
app.get('/api/votes', async (_req: Request, res: Response) => {
    const db = await getDb();
    try {
        const votes = await db.all(`
            SELECT tokenAddress, 
                   SUM(CASE WHEN vote = 1 THEN 1 ELSE 0 END) as upvotes,
                   SUM(CASE WHEN vote = -1 THEN 1 ELSE 0 END) as downvotes
            FROM votes 
            GROUP BY tokenAddress
        `);
        
        // Convert to object with tokenAddress as key
        const votesMap = votes.reduce((acc: Record<string, { upvotes: number; downvotes: number }>, curr: { tokenAddress: string; upvotes: number; downvotes: number }) => {
            acc[curr.tokenAddress] = {
                upvotes: curr.upvotes || 0,
                downvotes: curr.downvotes || 0
            };
            return acc;
        }, {});
        
        res.json(votesMap);
    } catch (error) {
        console.error('Error getting all votes:', error);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        await db.close();
    }
});

export { app, server, wss }; 