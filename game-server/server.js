console.log('Server.js loaded and running...');

require('./schedulers/mainScheduler');
require('./schedulers/electionScheduler');
require('./schedulers/seasonScheduler');
require('./schedulers/trainScheduler');
require('./schedulers/taxScheduler');
require('./schedulers/bankScheduler');


const fs = require('fs');
const path = require('path');  
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const http = require('http');
const { Server } = require('socket.io');
const Player = require('./models/player');  // Ensure this is correct
const Grid = require('./models/grid');
const Chat = require('./models/chat'); // Import ChatMessage model

const worldRoutes = require('./routes/worldRoutes');
const gridRoutes = require('./routes/gridRoutes'); // Import NPCsInGrid routes
const playerRoutes = require('./routes/playerRoutes'); 
const authRoutes = require('./routes/auth');  // <-- Import auth routes
const tradingRoutes = require('./routes/tradingRoutes'); // Import trading routes
const frontierRoutes = require('./routes/frontierRoutes'); // Import frontier routes
const settlementRoutes = require('./routes/settlementRoutes'); // Import frontier routes
const scheduleRoutes = require('./routes/scheduleRoutes'); // Import frontier routes
const chatRoutes = require('./routes/chatRoutes');
const paymentRoutes = require('./routes/paymentRoutes');

const leoProfanity = require('leo-profanity');

// Load environment variables
dotenv.config();


// Middleware
const corsOptions = {
  origin: [
    'http://localhost:3000',
    'https://vvgame.onrender.com',
    'https://www.valleyviewgame.com'
  ],
  credentials: true, // optional: if you're using cookies or auth headers
};
// Declare app before using it
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors(corsOptions));

app.use(express.json({ limit: '10mb' }));

// Logging middleware for debugging
app.use((req, res, next) => {
  next();
});


mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  maxPoolSize: 50,
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 30000,
})

.then(() => {
    console.log("✅ Connected to MongoDB");

    // Create HTTP server and bind it to Express app
    const httpServer = http.createServer(app);

    // Create socket.io server
    const io = new Server(httpServer, {
      cors: {
        origin: [
          'https://vvgame.onrender.com',
          'https://www.valleyviewgame.com'
        ],
        methods: ['GET', 'POST'],
      }
    });

///////// SOCKET EVENTS //////////

    io.on('connection', (socket) => {
      //console.log(`🟢 New client connected: ${socket.id}`);

      // Track controller assignments (move this OUTSIDE the connection handler)
      const gridControllers = io.gridControllers = io.gridControllers || new Map();

      // Track connected players per grid (shared across all sockets)
      const connectedPlayersByGrid = io.connectedPlayersByGrid = io.connectedPlayersByGrid || new Map();

      // 📡 Respond to a request for currently connected players in the grid
      socket.on('request-connected-players', async ({ gridId }) => {
        // Use the connectedPlayersByGrid map to get the player IDs
        const players = Array.from(connectedPlayersByGrid.get(gridId) || []);
        socket.emit('connected-players', { gridId, connectedPlayerIds: players });
      });

      socket.on('disconnect', () => {
        //console.log(`🔴 Client disconnected: ${socket.id}`);
        // Check all grids this socket was controlling
        gridControllers.forEach((controller, gridId) => {
          if (controller.socketId === socket.id) {
            const room = io.sockets.adapter.rooms.get(gridId);
            const nextSocket = room?.values()?.next()?.value;
            if (nextSocket) {
              const nextSocketObj = io.sockets.sockets.get(nextSocket);
              gridControllers.set(gridId, {
                socketId: nextSocket,
                username: nextSocketObj.username
              });
              io.to(gridId).emit('npc-controller-update', {
                gridId,
                controllerUsername: nextSocketObj.username
              });
            } else {
              gridControllers.delete(gridId);
              io.to(gridId).emit('npc-controller-update', {
                gridId,
                controllerUsername: null
              });
            }
          }
        });
        // Remove the player from connectedPlayersByGrid and broadcast update
        if (socket.gridId && socket.playerId) {
          const playerSet = connectedPlayersByGrid.get(socket.gridId);
          if (playerSet) {
            playerSet.delete(socket.playerId);
            io.to(socket.gridId).emit('connected-players', {
              gridId: socket.gridId,
              connectedPlayerIds: Array.from(playerSet),
            });
          }
          // Emit player-disconnected for legacy logic
          //console.log(`❌ Emitting player-disconnected for ${socket.playerId}`);
          socket.to(socket.gridId).emit('player-disconnected', {
            playerId: socket.playerId
          });
        }
      });
      
      socket.on('join-grid', async ({ gridId, playerId }) => {
        //console.log(`📡 Socket ${socket.id} joined grid room: ${gridId}`);
        socket.join(gridId);      
        socket.gridId = gridId;
        socket.playerId = playerId; // Store playerId on the socket
        // Track player in connectedPlayersByGrid and broadcast update
        if (!connectedPlayersByGrid.has(gridId)) {
          connectedPlayersByGrid.set(gridId, new Set());
        }
        connectedPlayersByGrid.get(gridId).add(playerId);
        io.to(gridId).emit('connected-players', {
          gridId,
          connectedPlayerIds: Array.from(connectedPlayersByGrid.get(gridId)),
        });
        //console.log(`📡 Player ${playerId} joined grid ${gridId}`);
        io.to(gridId).emit('player-connected', { playerId });
        try {
          const gridDoc = await Grid.findById(gridId);
          const pcs = gridDoc?.playersInGrid || {};
          socket.emit('current-grid-players', { gridId, pcs });
          //console.log(`📦 Sent current PCs in grid ${gridId} to ${socket.id}`);
        } catch (error) {
          console.error(`❌ Failed to fetch grid PCs for grid ${gridId}:`, error);
        }
        // If no controller exists for this grid, assign this socket
        if (!gridControllers.has(gridId)) {
          gridControllers.set(gridId, { socketId: socket.id, username: socket.username });
          // Broadcast to ALL clients in the grid
          io.to(gridId).emit('npc-controller-update', { 
            gridId,
            controllerUsername: socket.username 
          });
          //console.log(`🎮 Socket ${socket.id} (${socket.username}) assigned as controller for grid ${gridId}`);
        } else {
          // Inform the new joiner who the current controller is
          socket.emit('npc-controller-update', {
            gridId,
            controllerUsername: gridControllers.get(gridId).username
          });
        }
      });

      socket.on('leave-grid', (gridId) => {
        socket.leave(gridId);
        // Remove from connectedPlayersByGrid and broadcast update
        const playerSet = connectedPlayersByGrid.get(gridId);
        if (playerSet) {
          playerSet.delete(socket.playerId);
          io.to(gridId).emit('connected-players', {
            gridId,
            connectedPlayerIds: Array.from(playerSet),
          });
        }
        // If this socket was the controller, assign to another socket in the room
        if (gridControllers.get(gridId)?.socketId === socket.id) {
          const room = io.sockets.adapter.rooms.get(gridId);
          const nextSocket = room?.values()?.next()?.value;
          if (nextSocket) {
            const nextSocketObj = io.sockets.sockets.get(nextSocket);
            gridControllers.set(gridId, {
              socketId: nextSocket,
              username: nextSocketObj.username
            });
            // Broadcast the new controller to all clients
            io.to(gridId).emit('npc-controller-update', {
              gridId,
              controllerUsername: nextSocketObj.username
            });
          } else {
            gridControllers.delete(gridId);
            io.to(gridId).emit('npc-controller-update', {
              gridId,
              controllerUsername: null
            });
          }
        }
      });
      socket.on('player-joined-grid', ({ gridId, playerId, username, playerData }) => {
        //console.log(`👋 Player ${username} joined grid ${gridId}`);
        //console.log('playerId = ', playerId, "; username = ", username, "; playerData = ", playerData);
        // Emit a distinct event name to avoid confusion and include the emitter's socket ID
        socket.to(gridId).emit('player-joined-sync', { playerId, username, playerData, emitterId: socket.id });
      });

      socket.on('player-left-grid', ({ gridId, playerId, username }) => {
        //console.log(`👋 Player ${username} left grid ${gridId}`);
        // Include the emitter's socket ID in the payload
        socket.to(gridId).emit('player-left-sync', { playerId, username, emitterId: socket.id });
      });
      // Track username with socket
      socket.on('set-username', ({ username }) => {
        socket.username = username;
        // If this socket is controlling any grids, update the username
        gridControllers.forEach((controller, gridId) => {
          if (controller.socketId === socket.id) {
            gridControllers.set(gridId, { 
              socketId: socket.id, 
              username 
            });
            // Broadcast the update
            io.to(gridId).emit('npc-controller-update', { 
              gridId,
              controllerUsername: username 
            });
          }
        });
      });


      // Handle incoming chat messages
      socket.on('send-chat-message', async (msg) => {
        const { scope, message, playerId, username } = msg;
        let scopeId;

        if (scope === 'grid') scopeId = socket.gridId;
        else if (scope === 'settlement') scopeId = socket.settlementId;
        else if (scope === 'frontier') scopeId = socket.frontierId;
        else return;

        const cleanedMessage = leoProfanity.clean(message);

        const newMessage = new Chat({
          playerId,
          username,
          message: cleanedMessage,
          scope,
          scopeId,
          timestamp: Date.now()
        });

        await newMessage.save(); // Save to MongoDB

        const payload = {
          id: newMessage._id.toString(),
          playerId: newMessage.playerId,
          username: newMessage.username,
          message: newMessage.message,
          scope: newMessage.scope,
          scopeId: newMessage.scopeId,
          timestamp: newMessage.timestamp,
          emitterId: socket.id, // 👈 Add this
        };

        io.to(scopeId).emit('receive-chat-message', payload);

      });

      socket.on('join-chat-rooms', ({ gridId, settlementId, frontierId }) => {
      if (gridId) socket.join(gridId);
      if (settlementId) socket.join(settlementId);
      if (frontierId) socket.join(frontierId);
      socket.gridId = gridId;
      socket.settlementId = settlementId;
      socket.frontierId = frontierId;
    });



    
    // 📡 Broadcast updated PCs to others in the same grid
    socket.on('update-NPCsInGrid-PCs', (payload) => {
      //console.log('📩 Received update-NPCsInGrid-PCs with payload:\n', JSON.stringify(payload, null, 2));
      const gridEntries = Object.entries(payload).filter(([key]) => key !== 'emitterId');
      const emitterId = payload.emitterId || socket.id;
      if (gridEntries.length === 0) {
        console.warn('⚠️ Payload missing grid-specific data.');
        return;
      }
      const [gridId, gridData] = gridEntries[0];
      const { pcs, playersInGridLastUpdated } = gridData || {};
      if (!gridId || !pcs || !playersInGridLastUpdated) {
        console.warn('⚠️ Invalid or incomplete PCs update:', {
          gridId,
          pcs,
          playersInGridLastUpdated,
          emitterId,
        });
        return;
      }
      // Preserve the original structure for rebroadcast
      const outboundPayload = {
        [gridId]: {
          pcs,
          playersInGridLastUpdated
        },
        emitterId
      };
      //console.log(`📤 Broadcasting sync-PCs for grid ${gridId}`);
      //console.log('📤 Outbound sync-PCs payload:\n', JSON.stringify(outboundPayload, null, 2));
      socket.to(gridId).emit('sync-PCs', outboundPayload);
    });

      // Broadcast updated NPCs to others in the same grid
      socket.on('update-NPCsInGrid-NPCs', (payload) => {
        //console.log('📩 Received update-NPCsInGrid-NPCs with payload:\n', JSON.stringify(payload, null, 2));
      
        const gridEntries = Object.entries(payload).filter(([key]) => key !== 'emitterId');
        const emitterId = payload.emitterId || socket.id;
        if (gridEntries.length === 0) {
          console.warn('⚠️ Payload missing grid-specific data.');
          return;
        }
        const [gridId, gridData] = gridEntries[0];
        const { npcs, NPCsInGridLastUpdated } = gridData || {};
        if (!gridId || !npcs || !NPCsInGridLastUpdated) {
          console.warn('⚠️ Invalid or incomplete NPCs update:', { gridId, npcs, NPCsInGridLastUpdated, emitterId });
          return;
        }
        const outboundPayload = {
          [gridId]: { npcs, NPCsInGridLastUpdated },
          emitterId,
        };
        //console.log(`📤 Broadcasting sync-NPCs for grid ${gridId}`);
        //console.log('📤 Outbound sync-NPCs payload:\n', JSON.stringify(outboundPayload, null, 2));  
        socket.to(gridId).emit('sync-NPCs', outboundPayload);
      });
      
      socket.on('npc-moved', ({ gridId, npcId, newPosition }) => {
        if (!gridId || !npcId || !newPosition) {
          console.error('Invalid npc-moved payload:', { gridId, npcId, newPosition });
          return;
        }
        socket.to(gridId).emit('npc-moved-sync', { npcId, newPosition, emitterId: socket.id });
        //console.log(`📡 server: npc-moved; NPC ${npcId} moved to ${JSON.stringify(newPosition)} in grid ${gridId}`);
      });

      // Handle NPC removal
      socket.on('remove-NPC', ({ gridId, npcId }) => {
        if (!gridId || !npcId) {
          console.error('Invalid remove-NPC payload:', { gridId, npcId });
          return;
        }
        //console.log(`📡 server: remove-NPC; NPC ${npcId} removed from grid ${gridId}`);
        socket.to(gridId).emit('remove-NPC', { gridId, npcId, emitterId: socket.id });
      });
      
      // Handle tile updates
      socket.on('update-tile', ({ gridId, updatedTiles }) => {
        //console.log(`🌍 update-tile received for grid ${gridId}`);
        io.in(gridId).fetchSockets().then(sockets => {
          //console.log(`📡 Broadcasting to ${sockets.length} clients in grid ${gridId}`);
        });
        // Broadcast tile updates to all clients in the grid
      socket.to(gridId).emit('tile-sync', {
          gridId,
          updatedTiles,
        });
      });

      // Broadcast updated resources to others in the same grid
      socket.on('update-resource', ({ gridId, updatedResources }) => {
        //console.log(`🌍 update-resource received for grid ${gridId}`);
        io.in(gridId).fetchSockets().then(sockets => {
          //console.log(`📡 Broadcasting to ${sockets.length} clients in grid ${gridId}`);
        });
      socket.to(gridId).emit('resource-sync', {
          gridId,
          updatedResources,
        });
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
console.log('Setting up player routes...');
app.use('/api', playerRoutes);
console.log('Setting up world routes...');
app.use('/api', worldRoutes);
console.log('Setting up NPCsInGrid routes...');
app.use('/api', gridRoutes);
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

app.get('/api/ping', (req, res) => {
  res.status(200).json({ success: true, message: 'pong' });
});

//
// EDITOR ROUTES 
//
app.post('/api/save-layout', (req, res) => {
  let { fileName, directory, grid } = req.body;
  console.log(`📂 Save request received - File: ${fileName}, Directory: ${directory}`);

  // 🔹 Log the request body to ensure correct structure
  console.log(`🔍 Full request body:`, req.body);

  // If grid is a string, parse it to ensure it's an object
  try {
    if (typeof grid === "string") {
      grid = JSON.parse(grid);
      console.log("✅ Parsed grid from string to object.");
    }
  } catch (error) {
    console.error('❌ Error parsing grid JSON:', error);
    return res.status(400).json({ success: false, error: 'Invalid grid format (not valid JSON)' });
  }

  if (!fileName || !directory || !grid || !grid.tiles || !grid.resources) {
    console.error('❌ Missing or invalid grid data:', { fileName, directory, grid });
    return res.status(400).json({ success: false, error: 'Missing or invalid grid data' });
  }

  // Set the save path
  const savePath = path.join(__dirname, `layouts/gridLayouts/${directory}/${fileName}.json`);

  // Ensure the directory exists
  fs.mkdirSync(path.dirname(savePath), { recursive: true });

  // ✅ Format the JSON manually so each row appears on a single line
  const formattedTiles = grid.tiles.map(row => `  [${row.map(cell => `"${cell}"`).join(", ")}]`).join(",\n");
  const formattedResources = grid.resources.map(row => `  [${row.map(cell => `"${cell}"`).join(", ")}]`).join(",\n");
  const formattedTileDistribution = Object.entries(grid.tileDistribution)
    .map(([key, value]) => `    "${key}": ${value}`)
    .join(",\n");
  const filteredResourceDistribution = Object.entries(grid.resourceDistribution || {})
    .filter(([_, value]) => value > 0)
    .map(([key, value]) => `    "${key}": ${value}`)
    .join(",\n");

    const jsonString = `{
      "tiles": [
    ${formattedTiles}
    ],
      "resources": [
    ${formattedResources}
    ],
      "tileDistribution": {
    ${formattedTileDistribution}
      }${filteredResourceDistribution ? `,
      "resourceDistribution": {
    ${filteredResourceDistribution}
      }` : ""}
    }`;

  console.log("📂 Final formatted JSON before saving:\n", jsonString);

  fs.writeFile(savePath, jsonString, (err) => {
    if (err) {
      console.error('❌ Error saving file:', err);
      return res.status(500).json({ success: false, error: 'Failed to save file' });
    }
    console.log(`✅ File saved successfully: ${savePath}`);
    res.json({ success: true, message: `Saved to ${savePath}` });
  });
});


app.get('/api/load-layout', (req, res) => {
  const { fileName, directory } = req.query;

  if (!fileName || !directory) {
    return res.status(400).json({ success: false, error: 'Missing fileName or directory' });
  }

  const filePath = path.join(__dirname, `layouts/gridLayouts/${directory}/${fileName}.json`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, error: 'File not found' });
  }

  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      console.error('❌ Error reading file:', err);
      return res.status(500).json({ success: false, error: 'Failed to read file' });
    }

    try {
      const parsedData = JSON.parse(data);
      console.log("📂 Loaded layout successfully:", parsedData);
      res.json({ success: true, grid: parsedData });
    } catch (error) {
      console.error('❌ Error parsing JSON:', error);
      res.status(500).json({ success: false, error: 'Invalid JSON format' });
    }
  });
});


console.log(`Server running on port ${PORT}`);
