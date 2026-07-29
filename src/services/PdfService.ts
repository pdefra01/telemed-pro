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
        const primaryColor = [16, 185, 129]; // Emerald 500
        const darkColor = [15, 23, 42]; // Slate 900
        const grayColor = [100, 116, 139]; // Slate 500

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
        doc.text(`Paciente: ${patient.name || patient.full_name || 'Consumidor Final'}`, 14, 72);
        doc.text(`DNI: ${patient.dni || 'No provisto'}`, 14, 77);
        doc.text(`Email: ${patient.email || ''}`, 14, 82);

        doc.setFontSize(12);
        doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
        doc.text('Detalles del Recibo:', 130, 65);
        doc.setFontSize(10);
        doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
        doc.text(`N° de Comprobante: ${invoice.id.split('-')[0].toUpperCase()}`, 130, 72);
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
    }
};
