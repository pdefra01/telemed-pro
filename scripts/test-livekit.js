import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';

const apiKey = "API2dVrrKfxR42M";
const apiSecret = "wuBHOvsAvNy7mplzJ28ZJG4uSiTHZ2eWbSqMgUedmeiB";
const host = "https://telemed-pro-34hna10s.livekit.cloud";

async function test() {
  const at = new AccessToken(apiKey, apiSecret, { identity: "test-user" });
  at.addGrant({ roomJoin: true, room: "test-room" });
  const token = await at.toJwt();
  
  console.log("Token:", token);
  
  try {
    const svc = new RoomServiceClient(host, apiKey, apiSecret);
    const rooms = await svc.listRooms();
    console.log("Success! Conexion establecida con LiveKit. Salas:", rooms);
  } catch (e) {
    console.error("Error connecting to LiveKit:", e.message);
  }
}
test();