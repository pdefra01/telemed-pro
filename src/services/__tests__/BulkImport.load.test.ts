import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bulkImportService } from '../BulkImportService';
import { affiliateRepository } from '../../repositories/AffiliateRepository';

// Mock del repositorio para no ensuciar la DB real en el test, 
// pero simulando un delay de red para realismo
vi.mock('../../repositories/AffiliateRepository', () => ({
  affiliateRepository: {
    createBulk: vi.fn(async (data) => {
      // Simular latencia de Supabase para 1000+ registros
      await new Promise(resolve => setTimeout(resolve, 500)); 
      return data;
    })
  }
}));

describe('BulkImportService - Load Test', () => {
  
  const generateLargeCSV = (count: number): string => {
    let csv = 'Nombre,Email,DNI,Telefono,Direccion\n';
    for (let i = 0; i < count; i++) {
      csv += `User ${i},user${i}@example.com,${10000000 + i},555-${i},Calle Falsa ${i}\n`;
    }
    return csv;
  };

  it('should handle 2000 affiliates in a single batch efficiently', async () => {
    const count = 2000;
    const csvContent = generateLargeCSV(count);
    
    console.log(`\n🚀 Starting Load Test: Importing ${count} affiliates...`);
    const startTime = performance.now();
    
    const result = await bulkImportService.processCSV(csvContent, 'agreement-uuid', 'Plan Corporativo');
    
    const endTime = performance.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    console.log(`✅ Load Test Completed!`);
    console.log(`⏱️ Duration: ${duration} seconds`);
    console.log(`📊 Success: ${result.success}`);
    console.log(`❌ Failed: ${result.failed}`);
    
    expect(result.success).toBe(count);
    expect(result.failed).toBe(0);
    expect(parseFloat(duration)).toBeLessThan(5); // Debería tardar menos de 5 segundos con el mock
  });

  it('should handle malformed lines in a large dataset without crashing', async () => {
    const validCount = 500;
    const invalidCount = 50;
    let csvContent = 'Nombre,Email,DNI,Telefono,Direccion\n';
    
    // Mezclar válidos e inválidos
    for (let i = 0; i < validCount; i++) {
      csvContent += `Valid User ${i},valid${i}@test.com,${i},123,Dir\n`;
    }
    for (let i = 0; i < invalidCount; i++) {
      csvContent += `InvalidUserWithoutCommas\n`;
    }

    const result = await bulkImportService.processCSV(csvContent, 'uuid', 'Plan');
    
    expect(result.success).toBe(validCount);
    expect(result.failed).toBe(invalidCount);
  });
});
