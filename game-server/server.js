const dotenv = require('dotenv');
dotenv.config();

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
};
// Declare app before using it
const app = express();
app.set('trust proxy', true); // Render: req.ip is the client, not the proxy (signup IP cap in routes/auth.js)
const PORT = process.env.PORT || 3001;

app.use(cors(corsOptions));

app.use(compression()); // gzip every response (grid bundles are JSON that compresses ~10x)
app.use(express.json({ limit: '10mb' }));

// Service status (update notice / maintenance). See utils/serviceMode.js.
app.get('/api/status', (req, res) => res.json(getStatus()));
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

.then(() => {
    console.log("✅ Connected to MongoDB");

    // ✅ Initialize timers after MongoDB connection is established
    if (process.env.NODE_ENV === 'production') {
      const { initializeTimers } = require('./schedulers/mainScheduler');
      initializeTimers();
      console.log("✅ Timers initialized after MongoDB connection");
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
      // Private room for player-specific pushes (mailbox/store badges, force-refresh).
      socket.on('join-player-room', ({ playerId } = {}) => {
        if (playerId) socket.join(String(playerId));
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
app.use('/api', authRoutes); // <-- Use auth routes for player registration/login
app.use('/api', require('./routes/unsubscribe')); // one-click unsubscribe from email footers (no session)
app.use('/api', require('./routes/dev')); // Edit Mode writes (developers, local dev only)
console.log('Setting up player routes...');
app.use('/api', playerRoutes);
console.log('Setting up world routes...');
app.use('/api', worldRoutes);
console.log('Setting up NPCsInGrid routes...');
app.use('/api', gridRoutes);
app.use('/api', enterGridRoutes);
app.use('/api', require('./routes/combatRoutes')); // POST /action/npc-kill: the one combat write (docs/audits/combat-and-npc-review-2026-10-07.md Track 2)
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
  const playerId = req.get('x-player-id') || req.body?.playerId;
  if (!(await isDeveloperPlayerId(playerId))) return res.status(403).json({ error: 'developer only' });
  const io = app.get('socketio');
  if (!io) return res.status(503).json({ error: 'socket server not ready' });
  io.emit('force-refresh', { reason: req.body?.reason || 'update' });
  res.json({ success: true, clients: io.engine.clientsCount });
});

app.get('/api/ping', (req, res) => {
  res.status(200).json({ success: true, message: 'pong' });
});


console.log(`Server running on port ${PORT}`);
