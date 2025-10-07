# ♛ Professional Chess Game

A modern, real-time multiplayer chess game built with Node.js, Express, Socket.IO, and Chess.js.

## 🎯 Features

- **Real-time Multiplayer**: Play chess with friends in real-time using WebSocket connections
- **Room System**: Create private rooms with custom IDs or join existing games
- **Full Chess Rules**: Complete implementation of chess rules including castling, en passant, and promotion
- **Chat System**: Built-in chat for player communication
- **Move History**: Track and review all moves made during the game
- **Game Controls**: Resign, offer draw, and accept/decline draw offers
- **Responsive Design**: Works seamlessly on desktop, tablet, and mobile devices
- **Spectator Mode**: Watch ongoing games without participating
- **Reconnection Support**: Automatic reconnection after network interruptions

## 🚀 Quick Start

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd chess
```

2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
npm start
```

4. Open your browser and navigate to:
```
http://localhost:3000
```

## 📝 Environment Configuration

Create a `.env` file in the root directory (use `.env.example` as template):

```env
PORT=3000
NODE_ENV=development
CORS_ORIGIN=*
SOCKET_PING_TIMEOUT=60000
SOCKET_PING_INTERVAL=25000
MAX_ROOM_INACTIVITY=3600000
CLEANUP_INTERVAL=1800000
MAX_CHAT_HISTORY=50
```

## 🎮 How to Play

### Creating a Game

1. Go to the landing page
2. Click "Create Room" or use "Quick Play"
3. Share the room ID with your friend
4. Wait for them to join

### Joining a Game

1. Get the room ID from your friend
2. Enter it in the "Join Room" field
3. Click "Join Game"
4. Start playing!

### Making Moves

- **Click Mode**: Click on a piece to select it, then click on a valid square to move
- Valid moves are highlighted in green
- Captures are highlighted in red
- Press `ESC` to deselect a piece

### Game Controls

- **Resign**: Give up the current game
- **Offer Draw**: Propose a draw to your opponent
- **Chat**: Communicate with your opponent (players only)

## 🧪 Testing

### Run Unit Tests

```bash
npm test
```

### Run Integration Tests

```bash
npm run test:integration
```

### Run Load Tests

```bash
node tests/load.test.js
```

The load test simulates 100 concurrent connections and measures:
- Connection success rate
- Message throughput
- Error rates
- System performance

## 📦 Project Structure

```
chess/
├── app.js                 # Main server file
├── package.json
├── .env.example
├── README.md
├── public/
│   ├── javaScripts/
│   │   ├── chessGame.js   # Main client-side chess logic
│   │   └── ...
│   └── StyleSheet/
│       └── style.css
├── views/
│   ├── landing.ejs        # Home page
│   └── index.ejs          # Game page
└── tests/
    ├── integration.test.js
    └── load.test.js
```

## 🛠️ Technology Stack

- **Backend**: Node.js, Express.js
- **Real-time Communication**: Socket.IO
- **Chess Engine**: Chess.js
- **Template Engine**: EJS
- **Styling**: TailwindCSS
- **Testing**: Jest, Socket.IO Client

## 🔒 Security Features

- Input validation and sanitization
- Rate limiting for moves and chat
- Room ID validation
- XSS protection
- CORS configuration
- Secure WebSocket connections

## ⚡ Performance Optimizations

- **Memory Management**:
  - Automatic cleanup of inactive rooms (1 hour inactivity)
  - Rate limit storage cleanup
  - Chat history limited to 50 messages per room
  - Session cleanup for disconnected players

- **Connection Handling**:
  - 30-second grace period for reconnection
  - Automatic cleanup of stale connections
  - Efficient message broadcasting

- **Client-Side**:
  - Lazy loading of chess library with fallbacks
  - Optimized board rendering
  - Debounced input handling

## 🐛 Known Issues & Solutions

### Issue: Chess library not loading
**Solution**: The app has multiple CDN fallbacks. If issues persist, check browser console for errors.

### Issue: Cannot join room
**Solution**: Ensure room ID format is correct (4-12 alphanumeric characters + hyphens).

### Issue: Moves not synchronizing
**Solution**: Check network connection. The app will attempt to reconnect automatically.

## 🔧 Development

### Running in Development Mode

```bash
npm run dev
```

### Debugging

Enable verbose logging by setting:
```env
NODE_ENV=development
```

Check browser console and server logs for detailed information.

## 📊 API Documentation

### WebSocket Events

#### Client → Server

- `joinRoom`: `{ roomId: string, preferredRole: 'white'|'black'|'spectator' }`
- `move`: `{ from: string, to: string, promotion?: string }`
- `chatMessage`: `{ message: string }`
- `resign`: (no payload)
- `offerDraw`: (no payload)
- `respondToDraw`: `{ accepted: boolean }`
- `resetGame`: (no payload)

#### Server → Client

- `roleAssigned`: `string`
- `boardState`: `string` (FEN notation)
- `move`: `{ from: string, to: string }`
- `moveHistory`: `Array<MoveObject>`
- `chatMessage`: `ChatMessage`
- `playersUpdate`: `{ white: string, black: string, spectators: number }`
- `gameEnd`: `{ type: string, winner?: string, message?: string }`
- `drawOfferReceived`: `{ from: string }`
- `error`: `{ message: string }`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## 📄 License

This project is licensed under the ISC License.

## 🙏 Acknowledgments

- Chess.js for the chess engine
- Socket.IO for real-time communication
- TailwindCSS for styling
- The chess community for inspiration

## 📞 Support

For issues, questions, or suggestions:
- Open an issue on GitHub
- Check existing documentation
- Review the FAQ section

## 🎯 Roadmap

- [ ] Move timers and time controls
- [ ] Game save/load functionality
- [ ] Player ratings and statistics
- [ ] Tournament mode
- [ ] AI opponent
- [ ] Mobile app versions
- [ ] Game analysis and hints
- [ ] Multiple board themes
- [ ] Sound effects
- [ ] Game replay feature

---

Made with ❤️ for chess lovers everywhere
