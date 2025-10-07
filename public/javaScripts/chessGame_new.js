// Simplified Chess Game - Click-to-Move Only
// Reliable, clean implementation without excessive fallbacks

// Socket.IO connection with simple error handling
const socket = io({
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 3
});

// Game state variables
let chess = null;
let boardElement = null;
let selectedSquare = null;
let playerRole = null;
let roomId = null;
let lastMove = null;

// Piece Unicode mapping
const PIECE_SYMBOLS = {
    'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
    'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟'
};

// Initialize the game when DOM is ready
document.addEventListener('DOMContentLoaded', initializeGame);

function initializeGame() {
    // Get room and role from URL params or window config
    const config = window.gameConfig || {};
    roomId = config.room;
    playerRole = config.role;
    
    // Find board element
    boardElement = document.querySelector('.chessboard') || document.getElementById('chessboard');
    if (!boardElement) {
        showError('Chess board element not found');
        return;
    }
    
    // Initialize chess engine
    if (typeof Chess === 'undefined') {
        showError('Chess library not loaded. Please refresh the page.');
        return;
    }
    
    try {
        chess = new Chess();
        renderBoard();
        setupEventListeners();
        joinRoom();
        initializeChat();
        removeDebugPanel();
    } catch (error) {
        showError('Failed to initialize chess game: ' + error.message);
    }
}

function renderBoard() {
    if (!chess || !boardElement) return;
    
    boardElement.innerHTML = '';
    const board = chess.board();
    
    // Determine if board should be flipped (black player sees from their perspective)
    const isFlipped = (playerRole === 'black');
    
    // Create 64 squares
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            // Flip board for black player
            const displayRow = isFlipped ? (7 - row) : row;
            const displayCol = isFlipped ? (7 - col) : col;
            
            const square = createSquare(displayRow, displayCol, board[displayRow][displayCol]);
            boardElement.appendChild(square);
        }
    }
    
    updateGameStatus();
}

function createSquare(row, col, piece) {
    const square = document.createElement('div');
    const squareName = String.fromCharCode(97 + col) + (8 - row);
    const isLight = (row + col) % 2 === 0;
    
    square.className = `square ${isLight ? 'light' : 'dark'}`;
    square.dataset.square = squareName;
    square.dataset.row = row;
    square.dataset.col = col;
    
    // Add piece if present
    if (piece) {
        const pieceElement = createPiece(piece, squareName);
        square.appendChild(pieceElement);
    }
    
    // Add click handler for square
    square.addEventListener('click', () => handleSquareClick(squareName));
    
    return square;
}

function createPiece(piece, square) {
    const pieceElement = document.createElement('div');
    pieceElement.className = `piece ${piece.color === 'w' ? 'white' : 'black'}`;
    pieceElement.innerHTML = PIECE_SYMBOLS[piece.type.toUpperCase()] || piece.type;
    pieceElement.dataset.piece = piece.type;
    pieceElement.dataset.color = piece.color;
    
    // Make piece non-draggable (click-only)
    pieceElement.draggable = false;
    // Allow piece to receive click events - clicks will bubble up to square
    
    return pieceElement;
}

function handleSquareClick(squareName) {
    console.log('🖱️ Square clicked:', squareName, 'Player role:', playerRole, 'Current turn:', chess ? chess.turn() : 'none');
    
    if (!chess || !isPlayerTurn()) {
        showNotification('⚠️', 'Not your turn', 'warning');
        return;
    }
    
    // If no square selected, try to select this square
    if (!selectedSquare) {
        selectSquare(squareName);
    } else {
        // Try to move to this square
        if (selectedSquare === squareName) {
            // Clicking same square - deselect
            clearSelection();
        } else {
            // Attempt move
            attemptMove(selectedSquare, squareName);
        }
    }
}

function selectSquare(squareName) {
    // Get piece at square - chess.js v1.0.0-beta.8 compatible
    const piece = getPieceAt(squareName);
    
    // Only allow selecting own pieces
    if (!piece || !isOwnPiece(piece)) {
        showNotification('⚠️', 'Select your own piece', 'warning');
        return;
    }
    
    selectedSquare = squareName;
    highlightSquare(squareName, 'selected');
    highlightValidMoves(squareName);
}

// Helper function to get piece at square (compatible with chess.js beta)
function getPieceAt(squareName) {
    if (!chess || !squareName) return null;
    
    // Convert square name (e.g., 'e4') to board coordinates
    const file = squareName.charCodeAt(0) - 97; // 'a' = 0, 'b' = 1, etc.
    const rank = 8 - parseInt(squareName[1]); // '8' = 0, '7' = 1, etc.
    
    const board = chess.board();
    if (board && board[rank] && board[rank][file]) {
        return board[rank][file];
    }
    
    return null;
}

function attemptMove(from, to) {
    console.log('🎯 Attempting move:', from, '→', to);
    
    try {
        const move = chess.move({ from, to, promotion: 'q' }); // Auto-promote to queen
        
        if (move) {
            console.log('✅ Move valid, sending to server:', move);
            // Valid move - send to server
            socket.emit('move', { from, to, promotion: 'q' });
            lastMove = { from, to };
            clearSelection();
            renderBoard();
            updateGameStatus();
        } else {
            // Invalid move
            console.log('❌ Invalid move');
            showNotification('❌', 'Invalid move', 'error');
            clearSelection();
        }
    } catch (error) {
        console.log('❌ Move error:', error);
        showNotification('❌', 'Move failed: ' + error.message, 'error');
        clearSelection();
    }
}

function clearSelection() {
    selectedSquare = null;
    // Remove all highlights
    document.querySelectorAll('.square').forEach(square => {
        square.classList.remove('selected', 'valid-move', 'valid-capture');
    });
}

function highlightSquare(squareName, className) {
    const square = document.querySelector(`[data-square="${squareName}"]`);
    if (square) {
        square.classList.add(className);
    }
}

function highlightValidMoves(squareName) {
    const moves = chess.moves({ square: squareName, verbose: true });
    
    moves.forEach(move => {
        const targetSquare = document.querySelector(`[data-square="${move.to}"]`);
        if (targetSquare) {
            const className = move.captured ? 'valid-capture' : 'valid-move';
            targetSquare.classList.add(className);
        }
    });
}

function isPlayerTurn() {
    if (!chess || !playerRole) return false;
    
    const currentTurn = chess.turn(); // 'w' or 'b'
    return (playerRole === 'white' && currentTurn === 'w') ||
           (playerRole === 'black' && currentTurn === 'b');
}

function isOwnPiece(piece) {
    if (!piece || !playerRole) return false;
    
    return (playerRole === 'white' && piece.color === 'w') ||
           (playerRole === 'black' && piece.color === 'b');
}

function updateGameStatus() {
    const statusElement = document.getElementById('gameStatus');
    const turnElement = document.getElementById('turnIndicator');
    
    if (!statusElement || !chess) return;
    
    let status = 'Game in progress';
    let turn = '';
    
function updateGameStatus() {
    const statusElement = document.getElementById('gameStatus');
    const turnElement = document.getElementById('turnIndicator');
    
    if (!statusElement || !chess) return;
    
    let status = 'Game in progress';
    let turn = '';
    
    // Use game_over() for compatibility with chess.js v1.0.0-beta
    if (chess.game_over && chess.game_over()) {
        if (chess.in_checkmate && chess.in_checkmate()) {
            const winner = chess.turn() === 'w' ? 'Black' : 'White';
            status = `Checkmate! ${winner} wins!`;
        } else if (chess.in_stalemate && chess.in_stalemate()) {
            status = 'Stalemate - Draw!';
        } else if (chess.in_draw && chess.in_draw()) {
            status = 'Draw!';
        }
    } else {
        if (isPlayerTurn()) {
            status = 'Your turn';
            if (chess.in_check && chess.in_check()) {
                status += ' - You are in check!';
            }
        } else {
            status = "Opponent's turn";
        }
        
        turn = chess.turn() === 'w' ? 'White to move' : 'Black to move';
    }
    
    statusElement.textContent = status;
    if (turnElement) {
        turnElement.textContent = turn;
    }
}
    
    statusElement.textContent = status;
    if (turnElement) {
        turnElement.textContent = turn;
    }
}

function joinRoom() {
    if (roomId && playerRole) {
        socket.emit('joinRoom', { roomId, preferredRole: playerRole });
        
        // Display room ID in the UI
        const roomCodeElement = document.getElementById('roomCode');
        if (roomCodeElement) {
            roomCodeElement.textContent = roomId;
        }
    }
}

function setupEventListeners() {
    // Game controls
    const resignBtn = document.getElementById('resignBtn');
    const drawBtn = document.getElementById('offerDrawBtn');
    
    if (resignBtn) {
        resignBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to resign?')) {
                socket.emit('resign');
            }
        });
    }
    
    if (drawBtn) {
        drawBtn.addEventListener('click', () => {
            if (confirm('Offer a draw to your opponent?')) {
                socket.emit('offerDraw');
            }
        });
    }
    
    // Draw offer modal
    const acceptBtn = document.getElementById('acceptDrawBtn');
    const declineBtn = document.getElementById('declineDrawBtn');
    
    if (acceptBtn) {
        acceptBtn.addEventListener('click', () => {
            socket.emit('respondToDraw', { accepted: true });
            hideDrawOfferModal();
        });
    }
    
    if (declineBtn) {
        declineBtn.addEventListener('click', () => {
            socket.emit('respondToDraw', { accepted: false });
            hideDrawOfferModal();
        });
    }
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            clearSelection();
        }
    });
}

// Chat functionality
function initializeChat() {
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendChatBtn');
    
    if (!chatInput || !sendBtn) return;
    
    sendBtn.addEventListener('click', sendChatMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            sendChatMessage();
        }
    });
    
    updateChatPermissions();
}

function sendChatMessage() {
    const chatInput = document.getElementById('chatInput');
    if (!chatInput) return;
    
    const message = sanitizeInput(chatInput.value.trim(), 200);
    
    if (!message) return;
    
    if (playerRole !== 'white' && playerRole !== 'black') {
        showNotification('⚠️', 'Only players can send messages', 'warning');
        return;
    }
    
    socket.emit('chatMessage', { message });
    chatInput.value = '';
}

function updateChatPermissions() {
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendChatBtn');
    const chatStatus = document.getElementById('chatStatus');
    
    const canChat = playerRole === 'white' || playerRole === 'black';
    
    if (chatInput) chatInput.disabled = !canChat;
    if (sendBtn) sendBtn.disabled = !canChat;
    if (chatStatus) {
        chatStatus.textContent = canChat ? 'Chat enabled' : 'Only players can send messages';
    }
}

function displayChatMessage(chatMessage) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;
    
    const messageElement = document.createElement('div');
    messageElement.className = 'chat-message mb-2 p-2 rounded';
    
    const roleColor = chatMessage.playerRole === 'white' ? 'text-gray-300' : 'text-gray-400';
    const roleName = chatMessage.playerRole.charAt(0).toUpperCase() + chatMessage.playerRole.slice(1);
    
    messageElement.innerHTML = `
        <div class="text-xs ${roleColor} mb-1">${roleName}</div>
        <div class="text-white">${escapeHtml(chatMessage.message)}</div>
    `;
    
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Socket event handlers
socket.on('roleAssigned', (role) => {
    playerRole = role;
    console.log('✅ Role assigned:', role);
    
    updateChatPermissions();
    updateGameStatus();
    renderBoard(); // Re-render board with correct orientation
    
    const roleElement = document.getElementById('yourRole');
    if (roleElement) {
        roleElement.textContent = role.charAt(0).toUpperCase() + role.slice(1);
    }
    
    showNotification('✅', `You are playing as ${role}`, 'success');
});

socket.on('boardState', (fen) => {
    if (!chess) return;
    
    try {
        if (fen && fen !== chess.fen()) {
            chess.load(fen);
            renderBoard();
        }
    } catch (error) {
        chess.reset();
        renderBoard();
    }
});

socket.on('move', (move) => {
    if (!chess) return;
    
    try {
        const moveResult = chess.move(move);
        if (moveResult) {
            lastMove = move;
            clearSelection();
            renderBoard();
        }
    } catch (error) {
        // Invalid move received
    }
});

socket.on('gameEnd', (result) => {
    clearSelection();
    updateGameStatus();
    
    setTimeout(() => {
        alert(`Game Over: ${result.type}\n${result.message || ''}`);
    }, 500);
});

socket.on('chatMessage', displayChatMessage);

socket.on('drawOfferReceived', (data) => {
    showDrawOfferModal(`${data.from} has offered a draw.`);
});

socket.on('connect', () => {
    updateConnectionStatus('Connected', true);
});

socket.on('disconnect', () => {
    updateConnectionStatus('Disconnected', false);
});

// Utility functions
function sanitizeInput(input, maxLength = 100) {
    if (typeof input !== 'string') return '';
    return input.trim().substring(0, maxLength).replace(/<[^>]*>/g, '');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showNotification(icon, message, type = 'info') {
    const toast = document.getElementById('notificationToast');
    const iconElement = document.getElementById('notificationIcon');
    const textElement = document.getElementById('notificationText');
    
    if (toast && iconElement && textElement) {
        iconElement.textContent = icon;
        textElement.textContent = message;
        
        toast.className = `fixed top-20 right-4 glass-effect rounded-lg p-4 z-40 transition-transform duration-300 ${getToastColor(type)}`;
        toast.style.transform = 'translateX(0)';
        
        setTimeout(() => {
            toast.style.transform = 'translateX(100%)';
        }, 3000);
    }
}

function getToastColor(type) {
    switch(type) {
        case 'success': return 'bg-green-500';
        case 'error': return 'bg-red-500';
        case 'warning': return 'bg-yellow-500';
        default: return 'bg-blue-500';
    }
}

function showDrawOfferModal(message) {
    const modal = document.getElementById('drawOfferModal');
    const messageElement = document.getElementById('drawOfferMessage');
    
    if (modal && messageElement) {
        messageElement.textContent = message;
        modal.classList.remove('hidden');
    }
}

function hideDrawOfferModal() {
    const modal = document.getElementById('drawOfferModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

function updateConnectionStatus(message, isConnected) {
    const statusElement = document.getElementById('statusText');
    const statusDot = document.getElementById('statusDot');
    
    if (statusElement) {
        statusElement.textContent = message;
    }
    
    if (statusDot) {
        statusDot.className = `w-3 h-3 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`;
    }
}

function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-red-600 text-white p-6 rounded-lg z-50 text-center';
    errorDiv.innerHTML = `
        <h3 class="text-xl font-bold mb-4">⚠️ Error</h3>
        <p class="mb-4">${message}</p>
        <button onclick="location.reload()" class="bg-white text-red-600 px-4 py-2 rounded font-bold">
            🔄 Reload Page
        </button>
    `;
    document.body.appendChild(errorDiv);
}

function removeDebugPanel() {
    const debugPanel = document.getElementById('debugPanel');
    if (debugPanel) {
        debugPanel.remove();
    }
}