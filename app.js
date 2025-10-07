const express = require('express');
const path = require('path');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const { Chess } = require('chess.js');

// Performance monitoring
const PerformanceMonitor = require('./utils/performanceMonitor');
const perfMonitor = new PerformanceMonitor();
perfMonitor.start(300000); // Log every 5 minutes

// Enhanced Socket.IO configuration for better connection handling
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000,
    upgradeTimeout: 30000,
    maxHttpBufferSize: 1e6
});

// Store multiple game rooms
let gameRooms = {};
let playerSessions = {}; // Store player sessions for reconnection

app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get('/',(req,res)=>{
    res.render('landing');
});

app.get('/game',(req,res)=>{
    const { room, role } = req.query;
    if (!room || !role) {
        return res.redirect('/');
    }
    
    // Validate role
    const validRoles = ['white', 'black', 'spectator'];
    if (!validRoles.includes(role)) {
        return res.redirect('/');
    }
    
    res.render('index', { room, role });
});

app.get('/home',(req,res)=>{
    res.render('landing');
});

// Handle favicon request to prevent 404 errors
app.get('/favicon.ico', (req, res) => {
    res.status(204).send(); // No content response
});

// Helper function to validate and sanitize input
function validateInput(input, maxLength = 100, allowedChars = /^[a-zA-Z0-9\s\-_.,!?'"()]*$/) {
    if (!input || typeof input !== 'string') {
        return null;
    }
    
    const trimmed = input.trim();
    if (trimmed.length === 0 || trimmed.length > maxLength) {
        return null;
    }
    
    if (!allowedChars.test(trimmed)) {
        return null;
    }
    
    return trimmed;
}

// Helper function to validate room ID
function validateRoomId(roomId) {
    if (!roomId || typeof roomId !== 'string') {
        return false;
    }
    
    // Room ID should be 4-12 alphanumeric characters
    const roomPattern = /^[A-Z0-9\-]{4,12}$/;
    return roomPattern.test(roomId.toUpperCase());
}

// Rate limiting storage (simple in-memory)
const rateLimits = new Map();

function checkRateLimit(socketId, action, maxRequests = 10, windowMs = 60000) {
    const now = Date.now();
    const key = `${socketId}-${action}`;
    
    if (!rateLimits.has(key)) {
        rateLimits.set(key, { count: 1, resetTime: now + windowMs });
        return true;
    }
    
    const limit = rateLimits.get(key);
    
    if (now > limit.resetTime) {
        // Reset window
        limit.count = 1;
        limit.resetTime = now + windowMs;
        return true;
    }
    
    if (limit.count >= maxRequests) {
        return false;
    }
    
    limit.count++;
    return true;
}

// Cleanup rate limits periodically to prevent memory leaks
setInterval(() => {
    const now = Date.now();
    for (const [key, limit] of rateLimits.entries()) {
        if (now > limit.resetTime + 300000) { // 5 minutes after reset
            rateLimits.delete(key);
        }
    }
}, 600000); // Run every 10 minutes

// Helper functions for room management
function getOrCreateRoom(roomId) {
    if (!gameRooms[roomId]) {
        gameRooms[roomId] = {
            chess: new Chess(),
            players: {},
            currentPlayer: 'w',
            spectators: [],
            moveHistory: [],
            chatHistory: [],
            createdAt: Date.now(),
            lastActivity: Date.now()
        };
    }
    gameRooms[roomId].lastActivity = Date.now();
    return gameRooms[roomId];
}

// Cleanup inactive rooms periodically to prevent memory leaks
setInterval(() => {
    const now = Date.now();
    const inactivityThreshold = 3600000; // 1 hour
    
    for (const roomId in gameRooms) {
        const room = gameRooms[roomId];
        if (now - room.lastActivity > inactivityThreshold) {
            console.log(`Cleaning up inactive room: ${roomId}`);
            delete gameRooms[roomId];
        }
    }
}, 1800000); // Run every 30 minutes

// Cleanup old player sessions
setInterval(() => {
    const now = Date.now();
    for (const sessionId in playerSessions) {
        const session = playerSessions[sessionId];
        if (!gameRooms[session.roomId]) {
            delete playerSessions[sessionId];
        }
    }
}, 1800000); // Run every 30 minutes

function generateSessionId() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

io.on('connection', (socket) => {
    console.log('a user connected', socket.id);
    perfMonitor.recordConnection();
    
    // Add error handling for socket connections
    socket.on('error', (error) => {
        console.error('Socket error for', socket.id, ':', error);
        perfMonitor.recordError();
    });
    
    socket.on('disconnect', (reason) => {
        console.log('User disconnected:', socket.id, 'Reason:', reason);
        perfMonitor.recordDisconnection();
        handleDisconnection(socket);
    });
    
    socket.on('connect_error', (error) => {
        console.error('Connection error for', socket.id, ':', error);
    });
    
    // Handle disconnection logic
    const disconnectTimers = new Map(); // Track disconnect timers
    
    function handleDisconnection(socket) {
        const roomId = socket.roomId;
        
        if (roomId && gameRooms[roomId]) {
            const room = gameRooms[roomId];
            
            // Remove from spectators if present
            room.spectators = room.spectators.filter(id => id !== socket.id);
            
            // Clear any existing disconnect timer for this socket
            if (disconnectTimers.has(socket.id)) {
                clearTimeout(disconnectTimers.get(socket.id));
                disconnectTimers.delete(socket.id);
            }
            
            // Handle player disconnection with grace period
            const timer = setTimeout(() => {
                if (room.players.white === socket.id) {
                    delete room.players.white;
                    console.log('White player slot available in room', roomId);
                } else if (room.players.black === socket.id) {
                    delete room.players.black;
                    console.log('Black player slot available in room', roomId);
                }
                
                // Update all clients in room
                io.to(roomId).emit('playersUpdate', {
                    white: room.players.white ? 'connected' : 'waiting',
                    black: room.players.black ? 'connected' : 'waiting',
                    spectators: room.spectators.length
                });
                
                disconnectTimers.delete(socket.id);
            }, 30000); // 30 seconds grace period for reconnection
            
            disconnectTimers.set(socket.id, timer);
        }
    }
    
    socket.on('joinRoom', ({ roomId, preferredRole }) => {
        // Validate room ID
        if (!validateRoomId(roomId)) {
            socket.emit('error', { message: 'Invalid room ID format' });
            return;
        }
        
        // Validate role
        const validRoles = ['white', 'black', 'spectator'];
        if (!validRoles.includes(preferredRole)) {
            socket.emit('error', { message: 'Invalid role specified' });
            return;
        }
        
        const room = getOrCreateRoom(roomId);
        socket.join(roomId);
        socket.roomId = roomId;
        
        let assignedRole = 'spectator';
        
        // Handle role assignment based on preference
        if (preferredRole === 'white') {
            if (!room.players.white) {
                room.players.white = socket.id;
                assignedRole = 'white';
                const sessionId = generateSessionId();
                playerSessions[sessionId] = { roomId, role: 'white' };
                socket.emit('sessionId', sessionId);
            } else {
                // White is taken, notify user
                socket.emit('roleUnavailable', { 
                    requested: 'white', 
                    message: 'White player slot is already taken. You can spectate or try black if available.' 
                });
                room.spectators.push(socket.id);
            }
        } else if (preferredRole === 'black') {
            if (!room.players.black) {
                room.players.black = socket.id;
                assignedRole = 'black';
                const sessionId = generateSessionId();
                playerSessions[sessionId] = { roomId, role: 'black' };
                socket.emit('sessionId', sessionId);
            } else {
                // Black is taken, notify user
                socket.emit('roleUnavailable', { 
                    requested: 'black', 
                    message: 'Black player slot is already taken. You can spectate or try white if available.' 
                });
                room.spectators.push(socket.id);
            }
        } else if (preferredRole === 'viewer' || preferredRole === 'spectator') {
            room.spectators.push(socket.id);
            assignedRole = 'spectator';
        } else {
            // No preference or invalid preference - assign first available
            if (!room.players.white) {
                room.players.white = socket.id;
                assignedRole = 'white';
                const sessionId = generateSessionId();
                playerSessions[sessionId] = { roomId, role: 'white' };
                socket.emit('sessionId', sessionId);
            } else if (!room.players.black) {
                room.players.black = socket.id;
                assignedRole = 'black';
                const sessionId = generateSessionId();
                playerSessions[sessionId] = { roomId, role: 'black' };
                socket.emit('sessionId', sessionId);
            } else {
                room.spectators.push(socket.id);
                assignedRole = 'spectator';
            }
        }
        
        socket.emit('roleAssigned', assignedRole);
        const currentFen = room.chess.fen();
        console.log(`Sending board state to ${socket.id}:`, currentFen);
        socket.emit('boardState', currentFen);
        socket.emit('moveHistory', room.moveHistory);
        socket.emit('chatHistory', room.chatHistory || []);
        
        // Notify all clients in room about player status
        io.to(roomId).emit('playersUpdate', {
            white: room.players.white ? 'connected' : 'waiting',
            black: room.players.black ? 'connected' : 'waiting',
            spectators: room.spectators.length
        });
        
        console.log(`Player ${socket.id} joined room ${roomId} as ${assignedRole} (requested: ${preferredRole})`);
    });
    
    // Handle reconnection attempts
    socket.on('reconnect', (sessionId) => {
        if (sessionId && playerSessions[sessionId]) {
            const { roomId, role } = playerSessions[sessionId];
            const room = gameRooms[roomId];
            
            if (room && !room.players[role]) {
                socket.join(roomId);
                socket.roomId = roomId;
                room.players[role] = socket.id;
                socket.emit('roleAssigned', role);
                socket.emit('boardState', room.chess.fen());
                socket.emit('moveHistory', room.moveHistory);
                socket.emit('chatHistory', room.chatHistory || []);
                
                io.to(roomId).emit('playersUpdate', {
                    white: room.players.white ? 'connected' : 'waiting',
                    black: room.players.black ? 'connected' : 'waiting',
                    spectators: room.spectators.length
                });
                
                console.log(`Player ${socket.id} reconnected to room ${roomId} as ${role}`);
                return;
            } else if (room) {
                // Role is taken, join as spectator
                socket.join(roomId);
                socket.roomId = roomId;
                room.spectators.push(socket.id);
                socket.emit('roleAssigned', 'spectator');
                socket.emit('boardState', room.chess.fen());
                socket.emit('moveHistory', room.moveHistory);
                socket.emit('chatHistory', room.chatHistory || []);
                socket.emit('roleUnavailable', { 
                    requested: role, 
                    message: `Your previous ${role} role is now taken. You are now spectating.` 
                });
                
                io.to(roomId).emit('playersUpdate', {
                    white: room.players.white ? 'connected' : 'waiting',
                    black: room.players.black ? 'connected' : 'waiting',
                    spectators: room.spectators.length
                });
                
                console.log(`Player ${socket.id} reconnected to room ${roomId} as spectator (${role} was taken)`);
                return;
            }
        }
    });

    socket.on('move', (move) => {
        const roomId = socket.roomId;
        if (!roomId || !gameRooms[roomId]) return;
        
        const room = gameRooms[roomId];
        const chess = room.chess;
        
        try {
            // Check if it's the player's turn
            if (chess.turn() === 'w' && room.players.white !== socket.id) return;
            if (chess.turn() === 'b' && room.players.black !== socket.id) return;

            const result = chess.move(move);
            if (!result) {
                console.log('invalid move');
                socket.emit('moveError', move);
            } else {
                // Add move to history
                room.moveHistory.push({
                    move: result.san,
                    color: result.color,
                    timestamp: new Date().toISOString()
                });
                
                room.currentPlayer = chess.turn();
                io.to(roomId).emit('move', move);
                io.to(roomId).emit('boardState', chess.fen());
                io.to(roomId).emit('moveHistory', room.moveHistory);
                
                // Check for game end conditions (compatible with chess.js v1.0.0-beta)
                if (chess.game_over && chess.game_over()) {
                    if (chess.in_checkmate && chess.in_checkmate()) {
                        const winner = chess.turn() === 'w' ? 'black' : 'white';
                        io.to(roomId).emit('gameEnd', { type: 'checkmate', winner: winner });
                    } else if (chess.in_stalemate && chess.in_stalemate()) {
                        io.to(roomId).emit('gameEnd', { type: 'stalemate', winner: null });
                    } else if (chess.in_threefold_repetition && chess.in_threefold_repetition()) {
                        io.to(roomId).emit('gameEnd', { type: 'threefold', winner: null });
                    } else if (chess.insufficient_material && chess.insufficient_material()) {
                        io.to(roomId).emit('gameEnd', { type: 'insufficient', winner: null });
                    } else if (chess.in_draw && chess.in_draw()) {
                        io.to(roomId).emit('gameEnd', { type: 'draw', winner: null });
                    }
                }
            }
        } catch (err) {
            console.log(err.message);
            socket.emit('moveError', move);
        }
    });

    // Chat functionality with validation
    socket.on('chatMessage', (data) => {
        const roomId = socket.roomId;
        if (!roomId || !gameRooms[roomId]) return;
        
        // Rate limiting for chat messages
        if (!checkRateLimit(socket.id, 'chat', 5, 30000)) {
            socket.emit('chatError', { message: 'You are sending messages too quickly' });
            return;
        }
        
        const room = gameRooms[roomId];
        
        // Only allow white and black players to send messages
        if (socket.id !== room.players.white && socket.id !== room.players.black) {
            socket.emit('chatError', { message: 'Only players can send messages' });
            return;
        }
        
        // Validate and sanitize message
        const message = validateInput(data.message, 200);
        if (!message) {
            socket.emit('chatError', { message: 'Invalid message content' });
            return;
        }
        
        // Determine player role
        let playerRole = 'spectator';
        if (socket.id === room.players.white) playerRole = 'white';
        else if (socket.id === room.players.black) playerRole = 'black';
        
        const chatMessage = {
            id: Date.now() + Math.random(),
            message: message,
            playerRole: playerRole,
            timestamp: new Date().toISOString(),
            socketId: socket.id
        };
        
        // Add to room chat history (limited to last 50 messages)
        if (!room.chatHistory) room.chatHistory = [];
        room.chatHistory.push(chatMessage);
        
        // Keep only last 50 messages to prevent memory leaks
        if (room.chatHistory.length > 50) {
            room.chatHistory = room.chatHistory.slice(-50);
        }
        
        // Broadcast to all players in the room
        io.to(roomId).emit('chatMessage', chatMessage);
    });

    socket.on('resetGame', () => {
        const roomId = socket.roomId;
        if (!roomId || !gameRooms[roomId]) return;
        
        const room = gameRooms[roomId];
        if (socket.id === room.players.white || socket.id === room.players.black) {
            room.chess.reset();
            room.moveHistory = [];
            io.to(roomId).emit('gameReset');
            io.to(roomId).emit('boardState', room.chess.fen());
            io.to(roomId).emit('moveHistory', room.moveHistory);
        }
    });

    socket.on('resign', () => {
        const roomId = socket.roomId;
        if (!roomId || !gameRooms[roomId]) return;
        
        const room = gameRooms[roomId];
        let winner = null;
        let resigningPlayer = null;
        
        if (socket.id === room.players.white) {
            winner = 'black';
            resigningPlayer = 'white';
        } else if (socket.id === room.players.black) {
            winner = 'white';
            resigningPlayer = 'black';
        } else {
            return; // Only players can resign
        }
        
        io.to(roomId).emit('gameEnd', { 
            type: 'resignation', 
            winner: winner,
            resigningPlayer: resigningPlayer
        });
        
        console.log(`${resigningPlayer} player resigned in room ${roomId}`);
    });

    socket.on('offerDraw', () => {
        const roomId = socket.roomId;
        if (!roomId || !gameRooms[roomId]) return;
        
        const room = gameRooms[roomId];
        let offeringPlayer = null;
        let opponentId = null;
        
        if (socket.id === room.players.white) {
            offeringPlayer = 'white';
            opponentId = room.players.black;
        } else if (socket.id === room.players.black) {
            offeringPlayer = 'black';
            opponentId = room.players.white;
        } else {
            return; // Only players can offer draws
        }
        
        if (!opponentId) {
            socket.emit('drawOfferError', 'No opponent to offer draw to');
            return;
        }
        
        // Send draw offer to the opponent
        io.to(opponentId).emit('drawOfferReceived', { from: offeringPlayer });
        
        // Confirm to the offering player
        socket.emit('drawOfferSent');
        
        console.log(`${offeringPlayer} offered draw in room ${roomId}`);
    });

    socket.on('respondToDraw', (response) => {
        const roomId = socket.roomId;
        if (!roomId || !gameRooms[roomId]) return;
        
        const room = gameRooms[roomId];
        let respondingPlayer = null;
        let opponentId = null;
        
        if (socket.id === room.players.white) {
            respondingPlayer = 'white';
            opponentId = room.players.black;
        } else if (socket.id === room.players.black) {
            respondingPlayer = 'black';
            opponentId = room.players.white;
        } else {
            return; // Only players can respond to draws
        }
        
        if (response.accepted) {
            // Draw accepted - end the game
            io.to(roomId).emit('gameEnd', { 
                type: 'draw_agreement', 
                winner: null,
                message: 'Draw accepted by mutual agreement'
            });
            console.log(`Draw accepted in room ${roomId}`);
        } else {
            // Draw declined - notify the offering player
            if (opponentId) {
                io.to(opponentId).emit('drawOfferDeclined', { by: respondingPlayer });
            }
            console.log(`Draw declined by ${respondingPlayer} in room ${roomId}`);
        }
    });
});

server.listen(3000, () => {
    console.log('server is running on port 3000');
});

