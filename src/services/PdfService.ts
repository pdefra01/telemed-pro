import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Invoice, Patient } from '../types';
import logoMedinex from '../logo_medinex.jpeg';

export const PdfService = {
    /**
     * Helper to load an image URL into an HTMLImageElement for jsPDF
     */
    loadImage: (url: string): Promise<HTMLImageElement> => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.onload = () => resolve(img);
            img.onerror = (e) => reject(e);
            img.src = url;
        });
    },

    /**
     * Generates and downloads a PDF receipt for a given invoice.
     */
    generateReceiptPDF: async (invoice: Invoice, patient: Patient) => {
        // Create new PDF document
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        // Colors
        const primaryColor: [number, number, number] = [16, 185, 129]; // Emerald 500
        const darkColor: [number, number, number] = [15, 23, 42]; // Slate 900
        const grayColor: [number, number, number] = [100, 116, 139]; // Slate 500

        try {
            // Load Logo
            const logo = await PdfService.loadImage(logoMedinex);
            // Draw logo (adjust width/height based on aspect ratio, approx 40x40)
            doc.addImage(logo, 'JPEG', 14, 15, 30, 30);
        } catch (error) {
            console.warn('Could not load logo for PDF', error);
            // Fallback: draw text if logo fails
            doc.setFontSize(22);
            doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
            doc.text('Medinex', 14, 25);
        }

        // Header - Company Info
        doc.setFontSize(20);
        doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
        doc.text('RECIBO / INVOICE', 130, 25);

        doc.setFontSize(10);
        doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
        doc.text('Telemed-Pro by Medinex', 130, 32);
        doc.text('Av. Corrientes 1234, CABA', 130, 37);
        doc.text('CUIT: 30-12345678-9', 130, 42);
        doc.text('contacto@medinex.com.ar', 130, 47);

        // Divider
        doc.setDrawColor(226, 232, 240); // Slate 200
        doc.line(14, 55, 196, 55);

        // Patient Info & Invoice Meta
        doc.setFontSize(12);
        doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
        doc.text('Facturar a:', 14, 65);
        doc.setFontSize(10);
        doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
        doc.text(`Paciente: ${patient.name || 'Consumidor Final'}`, 14, 72);
        doc.text(`DNI: ${patient.dni || 'No provisto'}`, 14, 77);
        doc.text(`Email: ${patient.email || ''}`, 14, 82);

        doc.setFontSize(12);
        doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
        doc.text('Detalles del Recibo:', 130, 65);
        doc.setFontSize(10);
        doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
        const displayNum = invoice.invoiceNumber 
            ? `0001-${String(invoice.invoiceNumber).padStart(8, '0')}` 
            : invoice.id.split('-')[0].toUpperCase();

        doc.text(`N° de Comprobante: ${displayNum}`, 130, 72);
        doc.text(`Fecha de Emisión: ${new Date(invoice.createdAt).toLocaleDateString()}`, 130, 77);
        doc.text(`Período de Cobertura: ${invoice.period}`, 130, 82);
        doc.text(`Estado: ${invoice.status === 'paid' ? 'PAGADO' : invoice.status.toUpperCase()}`, 130, 87);

        // Table
        const tableBody = [
            [
                `Suscripción ${patient.planName || 'Plan Médico'} - Período ${invoice.period}`,
                '1',
                `$${invoice.totalAmount.toLocaleString()}`,
                `$${invoice.totalAmount.toLocaleString()}`
            ]
        ];

        autoTable(doc, {
            startY: 100,
            head: [['Descripción', 'Cant.', 'Precio Unit.', 'Subtotal']],
            body: tableBody,
            theme: 'plain',
            headStyles: {
                fillColor: [248, 250, 252], // Slate 50
                textColor: [15, 23, 42],
                fontStyle: 'bold',
                lineWidth: 0.1,
                lineColor: [226, 232, 240]
            },
            bodyStyles: {
                textColor: [71, 85, 105], // Slate 600
            },
            alternateRowStyles: {
                fillColor: [255, 255, 255]
            },
            columnStyles: {
                0: { cellWidth: 90 },
                1: { cellWidth: 20, halign: 'center' },
                2: { cellWidth: 35, halign: 'right' },
                3: { cellWidth: 35, halign: 'right' }
            }
        });

        // Totals
        // @ts-ignore
        const finalY = doc.lastAutoTable.finalY || 130;

        doc.setDrawColor(226, 232, 240);
        doc.line(130, finalY + 10, 196, finalY + 10);

        doc.setFontSize(10);
        doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
        doc.text('Subtotal:', 130, finalY + 17);
        doc.text(`$${invoice.netAmount.toLocaleString()}`, 196, finalY + 17, { align: 'right' });

        doc.text('Impuestos:', 130, finalY + 24);
        doc.text(`$${invoice.taxAmount.toLocaleString()}`, 196, finalY + 24, { align: 'right' });

        doc.setFontSize(14);
        doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
        doc.text('Total:', 130, finalY + 34);
        doc.text(`$${invoice.totalAmount.toLocaleString()}`, 196, finalY + 34, { align: 'right' });

        // Paid Stamp
        if (invoice.status === 'paid') {
            doc.setDrawColor(16, 185, 129); // Emerald 500
            doc.setLineWidth(1);
            doc.setTextColor(16, 185, 129);
            doc.setFontSize(24);
            // Draw rotated text roughly in center
            doc.text('PAGADO', 40, finalY + 30, { angle: 25 });
        }

        // Footer
        doc.setFontSize(8);
        doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
        doc.text('Este documento es un comprobante de pago generado electrónicamente.', 105, 280, { align: 'center' });
        doc.text('Medinex Telemedicina - Todos los derechos reservados.', 105, 285, { align: 'center' });

        // Save
        doc.save(`Recibo_TelemedPro_${invoice.period}_${patient.dni || 'Paciente'}.pdf`);
    },

    /**
     * Generates and downloads a PDF receipt for a manual payment/movement.
     */
    generateMovementReceiptPDF: async (movement: any, patient: Patient) => {
        // Create new PDF document
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        // Colors
        const primaryColor: [number, number, number] = [16, 185, 129]; // Emerald 500
        const darkColor: [number, number, number] = [15, 23, 42]; // Slate 900
        const grayColor: [number, number, number] = [100, 116, 139]; // Slate 500

        try {
            // Load Logo
            const logo = await PdfService.loadImage(logoMedinex);
            // Draw logo
            doc.addImage(logo, 'JPEG', 14, 15, 30, 30);
        } catch (error) {
            console.warn('Could not load logo for PDF', error);
            doc.setFontSize(22);
            doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
            doc.text('Medinex', 14, 25);
        }

        // Header - Company Info
        doc.setFontSize(20);
        doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
        doc.text('RECIBO DE PAGO', 130, 25);

        doc.setFontSize(10);
        doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
        doc.text('Telemed-Pro by Medinex', 130, 32);
        doc.text('Av. Corrientes 1234, CABA', 130, 37);
        doc.text('CUIT: 30-12345678-9', 130, 42);
        doc.text('contacto@medinex.com.ar', 130, 47);

        // Divider
        doc.setDrawColor(226, 232, 240); // Slate 200
        doc.line(14, 55, 196, 55);

        // Patient Info & Receipt Meta
        doc.setFontSize(12);
        doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
        doc.text('Recibí de:', 14, 65);
        doc.setFontSize(10);
        doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
        doc.text(`Paciente: ${patient.name || 'Consumidor Final'}`, 14, 72);
        doc.text(`DNI: ${patient.dni || 'No provisto'}`, 14, 77);
        doc.text(`Email: ${patient.email || ''}`, 14, 82);

        doc.setFontSize(12);
        doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
        doc.text('Detalles del Recibo:', 130, 65);
        doc.setFontSize(10);
        doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
        const receiptNumberStr = movement.receiptNumber 
            ? `0001-${String(movement.receiptNumber).padStart(8, '0')}`
            : (movement.id ? movement.id.split('-')[0].toUpperCase() : 'MANUAL');

        doc.text(`N° de Comprobante: ${receiptNumberStr}`, 130, 72);
        doc.text(`Fecha: ${new Date(movement.createdAt).toLocaleDateString()}`, 130, 77);
        doc.text(`Forma de Pago: ${movement.source || 'Efectivo/Manual'}`, 130, 82);

        // Table
        const tableBody = [
            [
                movement.type === 'payment' ? 'Pago a cuenta / Cobro' : 'Ajuste de saldo',
                '1',
                `$${movement.amount.toLocaleString()}`,
                `$${movement.amount.toLocaleString()}`
            ]
        ];

        autoTable(doc, {
            startY: 100,
            head: [['Descripción', 'Cant.', 'Precio Unit.', 'Subtotal']],
            body: tableBody,
            theme: 'plain',
            headStyles: {
                fillColor: [248, 250, 252], // Slate 50
                textColor: darkColor,
                fontStyle: 'bold',
                lineWidth: 0.1,
                lineColor: [226, 232, 240], // Slate 200
            },
            bodyStyles: {
                textColor: grayColor,
                lineWidth: 0.1,
                lineColor: [226, 232, 240], // Slate 200
            },
            alternateRowStyles: {
                fillColor: [255, 255, 255]
            },
            columnStyles: {
                0: { cellWidth: 90 },
                1: { cellWidth: 20, halign: 'center' },
                2: { cellWidth: 35, halign: 'right' },
                3: { cellWidth: 35, halign: 'right' },
            }
        });

        // Totals
        const finalY = (doc as any).lastAutoTable.finalY + 10;
        
        doc.setFontSize(10);
        doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
        doc.text('Total Pagado:', 130, finalY);
        
        doc.setFontSize(14);
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.setFont('helvetica', 'bold');
        doc.text(`$${movement.amount.toLocaleString()}`, 180, finalY, { align: 'right' });

        // Footer
        const pageHeight = doc.internal.pageSize.height;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(148, 163, 184); // Slate 400
        doc.text('Este documento es un comprobante de pago no válido como factura.', 105, pageHeight - 20, { align: 'center' });
        doc.text('Gracias por elegir Telemed-Pro by Medinex.', 105, pageHeight - 15, { align: 'center' });

        // Download
        doc.save(`Recibo_Medinex_${patient.dni || 'Paciente'}_${new Date().getTime()}.pdf`);
    }
};
