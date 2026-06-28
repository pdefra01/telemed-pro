/**
 * Módulo Criptográfico de Firma Digital y Firma Electrónica Avanzada
 * Utiliza la API nativa de Web Crypto (ECDSA P-256 + AES-GCM-256)
 */

// Utilidad para codificar y decodificar bytes
const encoder = new TextEncoder();
const decoder = new TextDecoder();

// Helper para convertir ArrayBuffer a Base64
export function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Helper para convertir Base64 a ArrayBuffer
export function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// Helper para convertir ArrayBuffer a Hex
export function bufferToHex(buffer: ArrayBuffer): string {
  return Array.prototype.map.call(new Uint8Array(buffer), (x: number) => ('00' + x.toString(16)).slice(-2)).join('');
}

// Helper para convertir Hex a ArrayBuffer
export function hexToBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes.buffer;
}

/**
 * Genera un par de claves ECDSA con curva P-256 para Firma Digital
 */
export async function generateKeyPair(): Promise<CryptoKeyPair> {
  const cryptoSubtle = globalThis.crypto?.subtle || (await import('crypto')).webcrypto.subtle;
  return await cryptoSubtle.generateKey(
    {
      name: "ECDSA",
      namedCurve: "P-256",
    },
    true, // Extraíble para poder guardar las claves
    ["sign", "verify"]
  );
}

/**
 * Exporta una clave pública a formato SPKI codificado en Base64
 */
export async function exportPublicKey(key: CryptoKey): Promise<string> {
  const cryptoSubtle = globalThis.crypto?.subtle || (await import('crypto')).webcrypto.subtle;
  const exported = await cryptoSubtle.exportKey("spki", key);
  return bufferToBase64(exported);
}

/**
 * Importa una clave pública desde formato SPKI en Base64
 */
export async function importPublicKey(base64Key: string): Promise<CryptoKey> {
  const cryptoSubtle = globalThis.crypto?.subtle || (await import('crypto')).webcrypto.subtle;
  const buffer = base64ToBuffer(base64Key);
  return await cryptoSubtle.importKey(
    "spki",
    buffer,
    {
      name: "ECDSA",
      namedCurve: "P-256",
    },
    true,
    ["verify"]
  );
}

/**
 * Deriva una clave AES-256 a partir de un PIN de 6 dígitos y un Salt (ej. DNI o ID del médico) usando PBKDF2
 */
async function deriveEncryptionKey(pin: string, saltString: string): Promise<CryptoKey> {
  const cryptoSubtle = globalThis.crypto?.subtle || (await import('crypto')).webcrypto.subtle;
  const pinBuffer = encoder.encode(pin);
  const saltBuffer = encoder.encode(saltString);

  // Importar PIN como clave base
  const baseKey = await cryptoSubtle.importKey(
    "raw",
    pinBuffer,
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  // Derivar clave simétrica AES-GCM
  return await cryptoSubtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBuffer,
      iterations: 100000,
      hash: "SHA-256",
    },
    baseKey,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Cifra la clave privada del médico usando su PIN de 6 dígitos y su ID como sal
 * Devuelve un JSON string con la clave privada cifrada, el IV y la sal utilizada
 */
export async function encryptPrivateKey(privateKey: CryptoKey, pin: string, doctorId: string): Promise<string> {
  const cryptoSubtle = globalThis.crypto?.subtle || (await import('crypto')).webcrypto.subtle;
  
  // 1. Exportar la clave privada a formato PKCS#8 en bruto
  const rawPrivateKey = await cryptoSubtle.exportKey("pkcs8", privateKey);

  // 2. Derivar clave simétrica desde el PIN de 6 dígitos
  const aesKey = await deriveEncryptionKey(pin, doctorId);

  // 3. Cifrar la clave privada usando AES-GCM con un IV aleatorio de 12 bytes
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const encryptedBuffer = await cryptoSubtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    aesKey,
    rawPrivateKey
  );

  // 4. Empaquetar y retornar
  const payload = {
    ciphertext: bufferToBase64(encryptedBuffer),
    iv: bufferToBase64(iv.buffer),
    salt: doctorId,
  };

  return JSON.stringify(payload);
}

/**
 * Descifra la clave privada del médico en caliente ingresando su PIN de 6 dígitos
 */
export async function decryptPrivateKey(encryptedPayloadJson: string, pin: string): Promise<CryptoKey> {
  const cryptoSubtle = globalThis.crypto?.subtle || (await import('crypto')).webcrypto.subtle;
  
  const payload = JSON.parse(encryptedPayloadJson);
  const { ciphertext, iv, salt } = payload;

  const encryptedBuffer = base64ToBuffer(ciphertext);
  const ivBuffer = base64ToBuffer(iv);

  // 1. Derivar la clave simétrica usando el mismo PIN y sal (doctorId)
  const aesKey = await deriveEncryptionKey(pin, salt);

  // 2. Descifrar el buffer PKCS#8
  const decryptedBuffer = await cryptoSubtle.decrypt(
    {
      name: "AES-GCM",
      iv: new Uint8Array(ivBuffer),
    },
    aesKey,
    encryptedBuffer
  );

  // 3. Importar la clave privada de vuelta a objeto CryptoKey
  return await cryptoSubtle.importKey(
    "pkcs8",
    decryptedBuffer,
    {
      name: "ECDSA",
      namedCurve: "P-256",
    },
    true,
    ["sign"]
  );
}

/**
 * Genera la firma digital criptográfica de la receta electrónica
 * Serializa de forma canónica y firma usando ECDSA P-256 + SHA-256
 */
export async function signPrescription(
  appointmentId: string,
  patientId: string,
  medications: any[],
  notes: string | undefined,
  privateKey: CryptoKey
): Promise<string> {
  const cryptoSubtle = globalThis.crypto?.subtle || (await import('crypto')).webcrypto.subtle;

  // 1. Serializar el payload de la receta de forma canónica
  // IMPORTANT: Only use fields that are actually stored in DB to ensure
  // verify can reproduce the exact same payload later.
  const canonicalPayload = JSON.stringify({
    appointmentId,
    patientId,
    medications: medications.map(m => ({
      name: m.name,
      instructions: m.instructions ?? '',
    })).sort((a, b) => a.name.localeCompare(b.name)),
    notes: notes || '',
  });

  // 2. Firmar el payload codificado
  const dataBuffer = encoder.encode(canonicalPayload);
  const signatureBuffer = await cryptoSubtle.sign(
    {
      name: "ECDSA",
      hash: { name: "SHA-256" },
    },
    privateKey,
    dataBuffer
  );

  // 3. Retornar en base64
  return bufferToBase64(signatureBuffer);
}

/**
 * Verifica la firma digital criptográfica de una receta de forma pública
 */
export async function verifyPrescription(
  appointmentId: string,
  patientId: string,
  medications: any[],
  notes: string | undefined,
  signatureBase64: string,
  publicKeyBase64: string
): Promise<boolean> {
  try {
    const cryptoSubtle = globalThis.crypto?.subtle || (await import('crypto')).webcrypto.subtle;

    // 1. Serializar el payload de la receta con la misma estructura canónica
    // Must match signPrescription exactly.
    const canonicalPayload = JSON.stringify({
      appointmentId,
      patientId,
      medications: medications.map(m => ({
        name: m.name,
        instructions: m.instructions ?? '',
      })).sort((a, b) => a.name.localeCompare(b.name)),
      notes: notes || '',
    });

    const dataBuffer = encoder.encode(canonicalPayload);
    const signatureBuffer = base64ToBuffer(signatureBase64);
    const publicKey = await importPublicKey(publicKeyBase64);

    // 2. Verificar la firma
    return await cryptoSubtle.verify(
      {
        name: "ECDSA",
        hash: { name: "SHA-256" },
      },
      publicKey,
      signatureBuffer,
      dataBuffer
    );
  } catch (err) {
    console.error("Error en verificación criptográfica:", err);
    return false;
  }
}
