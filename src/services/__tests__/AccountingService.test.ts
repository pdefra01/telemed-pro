import { describe, it, expect, beforeEach } from 'vitest';
import { AccountingService } from '../AccountingService';
import { Invoice } from '../../types';

describe('AccountingService', () => {
  let accountingService: AccountingService;

  beforeEach(() => {
    accountingService = new AccountingService();
  });

  describe('generateCSVExport', () => {
    it('should generate a CSV with headers and correctly formatted rows', () => {
      const mockInvoices: Partial<Invoice>[] = [
        {
          period: '2024-05',
          entityType: 'affiliate',
          netAmount: 1000,
          taxAmount: 245,
          totalAmount: 1245,
          createdAt: '2024-05-27T10:00:00Z'
        },
        {
          period: '2024-05',
          entityType: 'agreement',
          netAmount: 50000,
          taxAmount: 12250,
          totalAmount: 62250,
          createdAt: '2024-05-27T11:00:00Z'
        }
      ];

      const csv = accountingService.generateCSVExport(mockInvoices as Invoice[]);
      const lines = csv.split('\n');

      expect(lines[0]).toBe('Fecha,Periodo,Tipo,Neto,Impuestos,Total');
      expect(lines[1]).toContain('2024-05-27,2024-05,affiliate,1000,245,1245');
      expect(lines[2]).toContain('2024-05-27,2024-05,agreement,50000,12250,62250');
    });

    it('should return only headers if no invoices are provided', () => {
      const csv = accountingService.generateCSVExport([]);
      expect(csv).toBe('Fecha,Periodo,Tipo,Neto,Impuestos,Total');
    });
  });
});
