import { Patient } from '../types';
import { affiliateRepository } from '../repositories/AffiliateRepository';

export class BulkImportService {
  /**
   * Procesa un archivo CSV y crea los afiliados
   * Formato esperado: nombre,email,dni,teléfono,dirección
   */
  async processCSV(fileContent: string, agreementId: string, planName: string): Promise<{ success: number; failed: number }> {
    const lines = fileContent.split('\n').filter(line => line.trim() !== '');
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    
    const affiliates: Partial<Patient>[] = [];
    let failed = 0;

    // Saltar encabezado
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      
      if (values.length < 3) {
        failed++;
        continue;
      }

      // Mapeo básico (esto se puede sofisticar con detección de headers)
      const affiliate: Partial<Patient> = {
        name: values[0],
        email: values[1],
        dni: values[2],
        phone: values[3] || '',
        address: values[4] || '',
        agreementId,
        planName,
        planStatus: 'active'
      };

      affiliates.push(affiliate);
    }

    try {
      if (affiliates.length > 0) {
        await affiliateRepository.createBulk(affiliates);
      }
      return { success: affiliates.length, failed };
    } catch (error) {
      console.error("Error en importación masiva:", error);
      return { success: 0, failed: affiliates.length + failed };
    }
  }
}

export const bulkImportService = new BulkImportService();
