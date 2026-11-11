const dotenv = require('dotenv');
dotenv.config();

// An async route that throws without its own try/catch is an unhandled rejection, and Node exits
// on those: one bad request (an expired Stripe key, 2026-10-30) took the whole server down and
// every request in flight failed with no CORS header. Log it and stay up; the route still owes
// its own try/catch (the request hangs until the client times out).
process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled rejection (server kept running):', reason?.stack || reason);
});

console.log('Server.js loaded and running...');
// Debug: Log email configuration at startup
console.log('📧 Email environment variables at startup:');
console.log('  ALERT_EMAIL_USERNAME:', process.env.ALERT_EMAIL_USERNAME);
console.log('  ALERT_EMAIL_RECEIVER:', process.env.ALERT_EMAIL_RECEIVER);

// Memory management
const { setupMemoryMonitoring, setupMemoryWarnings } = require('./utils/memoryManagement');
setupMemoryMonitoring();
setupMemoryWarnings();

// Load scheduler modules but don't initialize timers yet (wait for MongoDB connection)
if (process.env.NODE_ENV === 'production') {
  console.log('🚀 Running in PRODUCTION mode - Schedulers ENABLED');
  // Schedulers will be initialized after MongoDB connects
  require('./schedulers/electionScheduler');
  require('./schedulers/seasonScheduler');
  require('./schedulers/trainScheduler');
  require('./schedulers/taxScheduler');
  require('./schedulers/bankScheduler');
  require('./schedulers/networthScheduler');
  require('./schedulers/dungeonScheduler');
} else {
  console.log('🏠 Running in DEVELOPMENT mode - Schedulers DISABLED to prevent conflicts with production');
}


const fs = require('fs');
const path = require('path');  
const express = require('express');
const compression = require('compression');
const cors = require('cors');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');
const Player = require('./models/player'); 
const Grid = require('./models/grid');
const Chat = require('./models/chat'); // Import ChatMessage model
const { setSocketIO } = require('./socketInstance');
const { getStatus, maintenanceGate, isDeveloperPlayerId } = require('./utils/serviceMode');

const worldRoutes = require('./routes/worldRoutes');
const gridRoutes = require('./routes/gridRoutes'); 
const playerRoutes = require('./routes/playerRoutes'); 
const authRoutes = require('./routes/auth');  
const tradingRoutes = require('./routes/tradingRoutes'); 
const frontierRoutes = require('./routes/frontierRoutes'); 
const settlementRoutes = require('./routes/settlementRoutes'); 
const scheduleRoutes = require('./routes/scheduleRoutes'); 
const chatRoutes = require('./routes/chatRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const enterGridRoutes = require('./routes/enterGridRoutes');


const leoProfanity = require('leo-profanity');



// Middleware
const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = [
      'http://localhost:3000',
      'https://vvgame.onrender.com',
      'https://www.valleyviewgame.com',
      'https://www.secretsofelsinore.com'
    ];
    const isLocalDev = process.env.NODE_ENV !== 'production' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || '');
    if (!origin || allowedOrigins.includes(origin) || isLocalDev) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  // the deploy build header (APP_BUILD below) must be readable by the cross-origin client
  exposedHeaders: ['X-App-Build'],
};

// Deploy build id (ported from House): every response carries it as X-App-Build, so a tab left
// open across a deploy notices the server changed and offers a refresh
// (game-client/src/UI/Modals/UpdatePrompt.js). Render injects RENDER_GIT_COMMIT per deploy; a
// restart of the same deploy keeps the same id, so only a real push prompts. Locally it is a
// fixed 'dev' (nodemon restarts would otherwise prompt all day); set APP_BUILD to test the prompt.
const APP_BUILD = process.env.APP_BUILD || process.env.RENDER_GIT_COMMIT || 'dev';
// Declare app before using it
const app = express();
app.set('trust proxy', true); // Render: req.ip is the client, not the proxy (signup IP cap in routes/auth.js)
const PORT = process.env.PORT || 3001;

app.use(cors(corsOptions));
app.use((req, res, next) => { res.set('X-App-Build', APP_BUILD); next(); });

app.use(compression()); // gzip every response (grid bundles are JSON that compresses ~10x)
app.use(express.json({ limit: '10mb' }));
// Player sessions (BL-2): verify the token, and make x-player-id mean the session's player (utils/session.js)
const { sessionMiddleware, claimGuard, socketPlayerId, ENFORCE: SESSION_ENFORCE } = require('./utils/session');
app.use(sessionMiddleware);

// Service status (update notice / maintenance). See utils/serviceMode.js.
app.get('/api/status', (req, res) => res.json({ ...getStatus(), build: APP_BUILD }));
app.use(maintenanceGate());

// Logging middleware for debugging
app.use((req, res, next) => {
  next();
});


mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  maxPoolSize: 10, // Reduced from 50 to save memory
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 30000,
  // Additional memory optimization options
  bufferCommands: false,
  autoIndex: false, // Don't build indexes automatically in production
})

// the offer rules (utils/offerRules.mjs, an ES module) load before the server takes requests
.then(() => require('./utils/offerEligibility').ready)
.then(() => {
    console.log("✅ Connected to MongoDB");

    // ✅ Initialize timers after MongoDB connection is established
    if (process.env.NODE_ENV === 'production') {
      const { initializeTimers } = require('./schedulers/mainScheduler');
      initializeTimers();
      console.log("✅ Timers initialized after MongoDB connection");
      // dungeon wiring ships in tuning/dungeonEntrances.json (the editor's Dungeons tab): the push
      // that deploys it is what makes it live, like a layout; local servers leave the shared registry alone
      require('./utils/dungeonWiring').syncDungeonWiring()
        .catch((err) => console.error('❌ dungeon wiring sync failed:', err));
    }

    // Create HTTP server and bind it to Express app
    const httpServer = http.createServer(app);

    // Create socket.io server
    const io = new Server(httpServer, {
      cors: {
        origin: corsOptions.origin, // same allowlist + local-dev rule as HTTP
        methods: ['GET', 'POST'],
      }
    });
    app.set('socketio', io); // ✅ Attach io to app so it's accessible in route handlers
    setSocketIO(io);         // ✅ Register globally for non-route modules
    
///////// SOCKET EVENTS //////////
    // Phase 1 (docs/refactor-plan.md): the socket carries only per-player notifications and chat.
    // There are no grid rooms, no NPC controller, and no PC/NPC/tile/resource sync.

    io.on('connection', (socket) => {
      socket.data.playerId = socketPlayerId(socket);
      // Private room for player-specific pushes (mailbox/store badges, force-refresh): only the
      // player the session names (handshake auth.token, or the token sent with the join; BL-2).
      socket.on('join-player-room', ({ playerId, token } = {}) => {
        if (!playerId) return;
        const sessionId = socketPlayerId(socket, token);
        if (sessionId) socket.data.playerId = sessionId;
        if (sessionId !== String(playerId)) {
          console.warn(`🔐 socket join-player-room for ${playerId} with session ${sessionId || '-'}${SESSION_ENFORCE === 'on' ? '' : ' (logged, not enforced)'}`);
          if (SESSION_ENFORCE === 'on') return;
        }
        socket.join(String(playerId));
      });

      // Chat rooms are the settlement and the frontier. Grid-scoped chat is gone with shared grids.
      socket.on('join-chat-rooms', ({ settlementId, frontierId } = {}) => {
        if (settlementId) socket.join(String(settlementId));
        if (frontierId) socket.join(String(frontierId));
        socket.settlementId = settlementId;
        socket.frontierId = frontierId;
      });

      socket.on('send-chat-message', async (msg = {}) => {
        const { scope, message, playerId, username } = msg;
        // a chat line speaks for the socket's session player only (BL-2)
        if (String(playerId || '') !== String(socket.data.playerId || '')) {
          console.warn(`🔐 chat as ${playerId} with session ${socket.data.playerId || '-'}${SESSION_ENFORCE === 'on' ? '' : ' (logged, not enforced)'}`);
          if (SESSION_ENFORCE === 'on') return;
        }
        let scopeId;
        if (scope === 'settlement') scopeId = socket.settlementId;
        else if (scope === 'frontier') scopeId = socket.frontierId;
        else return;
        if (!scopeId || typeof message !== 'string' || !message.trim()) return;

        const cleanedMessage = leoProfanity.clean(message);
        const newMessage = new Chat({ playerId, username, message: cleanedMessage, scope, scopeId, timestamp: Date.now() });
        await newMessage.save();

        io.to(scopeId).emit('receive-chat-message', {
          id: newMessage._id.toString(),
          playerId: newMessage.playerId,
          username: newMessage.username,
          message: newMessage.message,
          scope: newMessage.scope,
          scopeId: newMessage.scopeId,
          timestamp: newMessage.timestamp,
          emitterId: socket.id,
        });
        socket.to(scopeId).emit('chat-badge-update', { playerId, hasUpdate: true });
      });
    });

  httpServer.listen(PORT, () => {
    console.log(`🚀 Server + WebSocket running on port ${PORT}`);
  });
})



//////////////////////////////////////////////////////
// Log every incoming request before any route handling
app.use((req, res, next) => {
  console.log(`Incoming request: ${req.method} ${req.url}`);
  next();
});


console.log('Setting up authentication routes...');
// A request that names its acting player must carry that player's session (utils/session.js)
app.use('/api', claimGuard);
// One writer per grid at a time: queues grid write requests per grid id (utils/gridWriteLock.js)
app.use('/api', require('./utils/gridWriteLock').gridWriteLock);
// ...then one writer per player: queues player write requests per playerId, after the grid lock (utils/playerWriteLock.js)
app.use('/api', require('./utils/playerWriteLock').playerWriteLock);
app.use('/api', authRoutes); // <-- Use auth routes for player registration/login
app.use('/api', require('./routes/loginSceneRoutes')); // the Begin screen's living grid (no player, read-only)
app.use('/api', require('./routes/unsubscribe')); // one-click unsubscribe from email footers (no session)
app.use('/api', require('./routes/dev')); // Edit Mode writes (developers, local dev only)
console.log('Setting up player routes...');
app.use('/api', playerRoutes);
console.log('Setting up world routes...');
app.use('/api', worldRoutes);
console.log('Setting up NPCsInGrid routes...');
app.use('/api', gridRoutes);
app.use('/api', enterGridRoutes);
app.use('/api', require('./routes/snugTravelRoutes')); // Travel with Snug: GET destinations, POST pay + arrival tile
app.use('/api', require('./routes/devTeleportRoutes')); // the debug panel's teleport (developers only): Snug places, arrival next to Snug / an NPC / 31,31
app.use('/api', require('./routes/caravanRoutes')); // The Caravan: sync, fill an order, mail earned rewards (utils/caravan.js)
app.use('/api', require('./routes/kentRoutes')); // Kent: POST /action/kent-sync / kent-sell / kent-dismiss, the board made on the server (utils/kentOffers.js)
app.use('/api', require('./routes/harvestFairRoutes')); // The Harvest Fair: claim and fill an order (server-checked)
app.use('/api', require('./routes/innRoutes')); // The Inn: POST rest (Money for full hp, then a cooldown on that Inn)
app.use('/api', require('./routes/storyRoutes')); // Story moments: waking Gertrude (utils/storyState.js)
app.use('/api', require('./routes/reviveRoutes')); // Revive for Gems from the "You have fallen" modal
app.use('/api', require('./routes/combatRoutes')); // POST /action/npc-kill: the one combat write (docs/audits/combat-and-npc-review-2026-10-07.md Track 2)
app.use('/api', require('./routes/actionRoutes')); // POST /action/*: one validated request per player action, answers with the player delta (Phase 5)
app.use('/api', require('./routes/stallActionRoutes')); // POST /action/stall-* and request-*: the Trade Stall, server-checked (Phase 5)
console.log('Setting up trading routes...');
app.use('/api', tradingRoutes);
console.log('Setting up frontier routes...');
app.use('/api', frontierRoutes);
console.log('Setting up settlement routes...');
app.use('/api', settlementRoutes);
console.log('Setting up schedule routes...');
app.use('/api', scheduleRoutes);
console.log('Setting up chat routes...');
app.use('/api', chatRoutes);
console.log('Setting up payment routes...');
app.use('/api', paymentRoutes);
console.log('Setting up analytics routes...');
app.use('/api/analytics', analyticsRoutes);



// Root endpoint
app.get('/', (req, res) => {
  res.send('Server is running!!!');
});

// List all registered routes
app._router.stack.forEach(function(r) {
  if (r.route && r.route.path) {
    console.log(`Registered route: ${r.route.path}`);
  }
});

// Ask every connected client to reload (used after deploys and service-mode flips). Developer-only.
app.post('/api/force-refresh', async (req, res) => {
  if (!(await isDeveloperPlayerId(req.get('x-player-id')))) return res.status(403).json({ error: 'developer only' });
  const io = app.get('socketio');
  if (!io) return res.status(503).json({ error: 'socket server not ready' });
  io.emit('force-refresh', { reason: req.body?.reason || 'update' });
  res.json({ success: true, clients: io.engine.clientsCount });
});

app.get('/api/ping', (req, res) => {
  res.status(200).json({ success: true, message: 'pong' });
});


console.log(`Server running on port ${PORT}`);
