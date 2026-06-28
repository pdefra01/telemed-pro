import { describe, it, expect } from 'vitest';
import {
  generateKeyPair,
  exportPublicKey,
  importPublicKey,
  encryptPrivateKey,
  decryptPrivateKey,
  signPrescription,
  verifyPrescription
} from '../crypto';

describe('Cryptographic Signature Engine (ECDSA P-256)', () => {
  it('should generate, export, and import keys successfully', async () => {
    const keyPair = await generateKeyPair();
    expect(keyPair.publicKey).toBeDefined();
    expect(keyPair.privateKey).toBeDefined();

    const exportedPublicBase64 = await exportPublicKey(keyPair.publicKey);
    expect(typeof exportedPublicBase64).toBe('string');
    expect(exportedPublicBase64.length).toBeGreaterThan(0);

    const importedPublic = await importPublicKey(exportedPublicBase64);
    expect(importedPublic.type).toBe('public');
    expect(importedPublic.algorithm.name).toBe('ECDSA');
  });

  it('should encrypt and decrypt a private key using a 6-digit PIN', async () => {
    const keyPair = await generateKeyPair();
    const pin = '123456';
    const doctorId = 'doctor-123';

    // Encrypt
    const encryptedPayload = await encryptPrivateKey(keyPair.privateKey, pin, doctorId);
    expect(typeof encryptedPayload).toBe('string');
    expect(encryptedPayload.includes('ciphertext')).toBe(true);

    // Decrypt
    const decryptedPrivateKey = await decryptPrivateKey(encryptedPayload, pin);
    expect(decryptedPrivateKey.type).toBe('private');
    expect(decryptedPrivateKey.algorithm.name).toBe('ECDSA');
  });

  it('should sign and verify a prescription successfully', async () => {
    const keyPair = await generateKeyPair();
    const publicKeyBase64 = await exportPublicKey(keyPair.publicKey);

    const appointmentId = 'appointment-abc';
    const patientId = 'patient-xyz';
    const medications = [
      { name: 'Ibuprofeno 400mg', dosage: '1 comprimido', frequency: 'cada 8 horas', duration: '3 días' },
      { name: 'Amoxicilina 500mg', dosage: '1 comprimido', frequency: 'cada 12 horas', duration: '7 días' }
    ];
    const notes = 'Tomar con abundante agua.';

    // Sign
    const signature = await signPrescription(appointmentId, patientId, medications, notes, keyPair.privateKey);
    expect(typeof signature).toBe('string');
    expect(signature.length).toBeGreaterThan(0);

    // Verify
    const isValid = await verifyPrescription(appointmentId, patientId, medications, notes, signature, publicKeyBase64);
    expect(isValid).toBe(true);
  });

  it('should fail verification if prescription data is tampered with', async () => {
    const keyPair = await generateKeyPair();
    const publicKeyBase64 = await exportPublicKey(keyPair.publicKey);

    const appointmentId = 'appointment-abc';
    const patientId = 'patient-xyz';
    const medications = [
      { name: 'Ibuprofeno 400mg', dosage: '1 comprimido', frequency: 'cada 8 horas', duration: '3 días' }
    ];
    const notes = 'Tomar con comida.';

    // Sign
    const signature = await signPrescription(appointmentId, patientId, medications, notes, keyPair.privateKey);

    // Tamper (change dosage from 1 comprimido to 2 comprimidos)
    const tamperedMedications = [
      { name: 'Ibuprofeno 400mg', dosage: '2 comprimidos', frequency: 'cada 8 horas', duration: '3 días' }
    ];

    // Verify
    const isValid = await verifyPrescription(appointmentId, patientId, tamperedMedications, notes, signature, publicKeyBase64);
    expect(isValid).toBe(false);
  });
});
