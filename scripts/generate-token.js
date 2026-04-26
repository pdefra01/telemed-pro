import { AccessToken } from 'livekit-server-sdk';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Load variables from .env.local
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env.local') });

const apiKey = process.env.LIVEKIT_API_KEY?.trim();
const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();

if (!apiKey || !apiSecret) {
  console.error("Error: Faltan LIVEKIT_API_KEY o LIVEKIT_API_SECRET en tu .env.local");
  process.exit(1);
}

// Debugging para ver si hay comillas o espacios raros
console.log("--- DEBUG INFO ---");
console.log(`API Key leída: [${apiKey}] (Longitud: ${apiKey.length})`);
console.log(`API Secret leída empieza con: [${apiSecret.substring(0, 4)}...] (Longitud: ${apiSecret.length})`);
console.log(`Hora de tu computadora: ${new Date().toISOString()}`);
console.log("------------------\n");

const createToken = async () => {
  const roomName = 'consulta-123';
  const participantName = 'Paciente Demo';

  const at = new AccessToken(apiKey, apiSecret, {
    identity: participantName,
  });

  at.addGrant({ roomJoin: true, room: roomName });

  return await at.toJwt(); // toJwt is async in newer versions
}

async function main() {
  try {
    const token = await createToken();
    console.log("=========================================");
    console.log("TOKEN GENERADO CON ÉXITO:");
    console.log(token);
    console.log("=========================================\n");
    console.log("Para probar la videollamada, abrí este link en tu navegador:");
    console.log(`http://localhost:3001/#/room/consulta-123?token=${token}`);
    console.log("\n⚠️ ATENCIÓN: Para que este link funcione:");
    console.log("1. Asegurate de que el puerto (3001) sea el mismo que te marca Vite en la terminal.");
    console.log("2. TENÉS QUE ESTAR LOGUEADO en la aplicación antes de abrir el link, sino te va a rebotar al login.");
  } catch (error) {
    console.error("Error al generar el token:", error);
  }
}

main();