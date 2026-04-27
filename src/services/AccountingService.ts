import { Invoice } from '../types';

export class AccountingService {
  /**
   * Genera un archivo CSV para exportación contable
   */
  generateCSVExport(invoices: Invoice[]): string {
    const headers = ['Fecha', 'Periodo', 'Tipo', 'Neto', 'Impuestos', 'Total'];
    
    const rows = invoices.map(inv => {
      const date = inv.createdAt.split('T')[0];
      return [
        date,
        inv.period,
        inv.entityType,
        inv.netAmount,
        inv.taxAmount,
        inv.totalAmount
      ].join(',');
    });

    return [headers.join(','), ...rows].join('\n');
  }

  /**
   * Descarga el CSV como un archivo en el navegador
   */
  downloadCSV(content: string, filename: string): void {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

export const accountingService = new AccountingService();
