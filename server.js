import express from 'express';
import cors from 'cors';
import { AccessToken } from 'livekit-server-sdk';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env variables only if not in production
if (process.env.NODE_ENV !== 'production') {
  config({ path: resolve(__dirname, '.env.local') });
}

const app = express();
app.use(cors());
app.use(express.json());

// Health check endpoint for Coolify
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// Serve static files from Vite build
const distPath = resolve(__dirname, 'dist');
app.use(express.static(distPath));

const apiKey = process.env.LIVEKIT_API_KEY?.trim();
const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();

if (!apiKey || !apiSecret) {
  console.warn("⚠️ WARNING: Missing LIVEKIT_API_KEY or LIVEKIT_API_SECRET in environment. Video tokens will fail.");
}

app.post('/api/livekit-token', async (req, res) => {
  try {
    const { appointmentId } = req.body;

    if (!appointmentId) {
      return res.status(400).json({ error: 'appointmentId is required' });
    }

    if (!apiKey || !apiSecret) {
      return res.status(500).json({ error: 'LiveKit server configuration is incomplete' });
    }

    const participantName = `User-${Math.floor(Math.random() * 1000)}`;
    const roomName = `room-${appointmentId}`;

    const at = new AccessToken(apiKey, apiSecret, {
      identity: participantName,
      name: participantName,
    });

    at.addGrant({ roomJoin: true, room: roomName });

    const token = await at.toJwt();

    res.json({ token, roomName });
  } catch (error) {
    console.error("Token generation error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Catch-all route to serve index.html for SPA routing
app.get('(.*)', (req, res) => {
  res.sendFile(join(distPath, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 TeleMed Pro corriendo en puerto ${PORT}`);
  console.log(`🌍 Entorno: ${process.env.NODE_ENV || 'development'}`);
  if (process.env.NODE_ENV === 'production') {
    console.log(`📁 Sirviendo archivos estáticos desde: ${distPath}`);
  }
});