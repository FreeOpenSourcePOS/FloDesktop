# FloPos Desktop

A self-hosted, offline-first Point of Sale (POS) system for restaurants and retail businesses.

## Features

- **POS Operations** - Order management, billing, table tracking
- **Kitchen Display (KDS)** - Real-time kitchen order tracking via WebSocket
- **Network Printing** - ESC/POS thermal receipt printing over TCP
- **Multi-station Support** - Configure multiple kitchen stations with paired printers
- **SQLite Database** - Local, portable database with no external dependencies
- **Cross-platform** - Runs on Windows, macOS, and Linux

## Requirements

- Node.js 20+
- npm 9+

## Getting Started

```bash
# Install dependencies
npm install

# Start the development server
npm run dev

# Build for production
npm run build:win   # Windows
npm run build:mac   # macOS
npm run build:linux # Linux
```

## Configuration

Create a `.env` file for production builds:

```env
JWT_SECRET=your-secure-secret-key
PORT=3088
```

## License

MIT
