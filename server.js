import express from 'express';
import cors from 'cors';
import { AccessToken } from 'livekit-server-sdk';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Load env variables
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '.env.local') });

const app = express();
app.use(cors());
app.use(express.json());

const apiKey = process.env.LIVEKIT_API_KEY?.trim();
const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();

if (!apiKey || !apiSecret) {
  console.error("FATAL: Missing LIVEKIT_API_KEY or LIVEKIT_API_SECRET in .env.local");
  process.exit(1);
}

app.post('/api/livekit-token', async (req, res) => {
  try {
    const { appointmentId } = req.body;

    if (!appointmentId) {
      return res.status(400).json({ error: 'appointmentId is required' });
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

const PORT = 3005;
app.listen(PORT, () => {
  console.log(`✅ Servidor local de tokens corriendo en http://localhost:${PORT}`);
});