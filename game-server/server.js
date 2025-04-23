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

const worldRoutes = require('./routes/worldRoutes');
const playerRoutes = require('./routes/playerRoutes'); 
const authRoutes = require('./routes/auth');  // <-- Import auth routes
const tradingRoutes = require('./routes/tradingRoutes'); // Import trading routes
const frontierRoutes = require('./routes/frontierRoutes'); // Import frontier routes
const settlementRoutes = require('./routes/settlementRoutes'); // Import frontier routes
const scheduleRoutes = require('./routes/scheduleRoutes'); // Import frontier routes

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
const corsOptions = {
  origin: ['http://localhost:3000', 'https://vvgame.onrender.com'], // ⬅️ your frontend domain
  credentials: true, // optional: if you're using cookies or auth headers
};
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
        origin: 'https://vvgame.onrender.com', // Your frontend
        methods: ['GET', 'POST'],
      }
    });

    // Set up socket events
    io.on('connection', (socket) => {
      console.log(`🟢 New client connected: ${socket.id}`);

      // Track controller assignments (move this OUTSIDE the connection handler)
      const gridControllers = io.gridControllers = io.gridControllers || new Map();

      socket.on('player-left-grid', ({ gridId, playerId, username }) => {
        console.log(`👋 Player ${username} left grid ${gridId}`);
        // Broadcast to all clients in the grid EXCEPT the sender
        socket.to(gridId).emit('player-left-grid', { playerId, username });
      });

      socket.on('player-joined-grid', ({ gridId, playerId, username, playerData }) => {
        console.log(`👋 Player ${username} joined grid ${gridId}`);
        // Broadcast to all clients in the grid EXCEPT the sender
        socket.to(gridId).emit('player-joined-grid', { playerId, username, playerData });
      });

      socket.on('join-grid', (gridId) => {
        console.log(`📡 Socket ${socket.id} joined grid room: ${gridId}`);
        socket.join(gridId);
        
        // If no controller exists for this grid, assign this socket
        if (!gridControllers.has(gridId)) {
          gridControllers.set(gridId, { socketId: socket.id, username: socket.username });
          // Broadcast to ALL clients in the grid
          io.to(gridId).emit('npc-controller-update', { 
            gridId,
            controllerUsername: socket.username 
          });
          console.log(`🎮 Socket ${socket.id} (${socket.username}) assigned as controller for grid ${gridId}`);
        } else {
          // Inform the new joiner who the current controller is
          socket.emit('npc-controller-update', {
            gridId,
            controllerUsername: gridControllers.get(gridId).username
          });
        }
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

      socket.on('leave-grid', (gridId) => {
        socket.leave(gridId);
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

      socket.on('disconnect', () => {
        console.log(`🔴 Client disconnected: ${socket.id}`);
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
      });

      // Broadcast updated gridState to others in the same grid
      socket.on('update-gridState', ({ gridId, gridState }) => {
        //console.log('📥 Received gridState-sync:', gridState);

        if (!gridState?.lastUpdated) {
          console.warn('⚠️ Received invalid or missing gridState:', gridState);
          return;
        }
        //console.log("📤 Emitting gridState with grazeEnd:", gridState.npcs["1743322170020"]?.grazeEnd);
        io.to(gridId).emit('gridState-sync', { updatedGridState: gridState });
      });

      // Handle tile updates
      socket.on('update-tile', ({ gridId, updatedTiles }) => {
        //console.log(`🌍 update-tile received for grid ${gridId}`);
        //console.log("📦 Incoming updatedTiles:", updatedTiles);

        io.in(gridId).fetchSockets().then(sockets => {
          //console.log(`📡 Broadcasting to ${sockets.length} clients in grid ${gridId}`);
        });

        // Broadcast tile updates to all clients in the grid
        io.to(gridId).emit('tile-sync', {
          gridId,
          updatedTiles,
        });
      });
      
      // Broadcast updated tiles and resources to others in the same grid
      socket.on('update-resource', ({ gridId, updatedTiles, updatedResources }) => {
        //console.log(`🌍 update-tile-resource received for grid ${gridId}`);
        //console.log("📦 Incoming updatedResources:", updatedResources);

        io.in(gridId).fetchSockets().then(sockets => {
          //console.log(`📡 Broadcasting to ${sockets.length} clients in grid ${gridId}`);
        });
        
        io.to(gridId).emit('resource-sync', {
          gridId,
          updatedResources,
        });
      });
    });

  httpServer.listen(PORT, () => {
    console.log(`🚀 Server + WebSocket running on port ${PORT}`);
  });
})


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
console.log('Setting up trading routes...');
app.use('/api', tradingRoutes);
console.log('Setting up frontier routes...');
app.use('/api', frontierRoutes);
console.log('Setting up settlement routes...');
app.use('/api', settlementRoutes);
console.log('Setting up schedule routes...');
app.use('/api', scheduleRoutes);


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
