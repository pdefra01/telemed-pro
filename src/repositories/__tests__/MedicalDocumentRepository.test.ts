import { describe, it, expect, vi, beforeEach } from 'vitest';

const { createSignedUrls, order } = vi.hoisted(() => ({ createSignedUrls: vi.fn(), order: vi.fn() }));

vi.mock('../../services/supabase', () => ({
    supabase: {
        from: () => ({ select: () => ({ eq: () => ({ order }) }) }),
        storage: { from: () => ({ createSignedUrls }) },
    },
}));

import { medicalDocumentRepository } from '../MedicalDocumentRepository';

const row = (id: string, url: string) => ({
    id, patient_id: 'p1', family_member_id: null, title: id, type: 'other', date: '2026-10-26', url, uploaded_by: 'patient',
});
const publicUrl = (path: string) => `https://x.supabase.co/storage/v1/object/public/medical-documents/${path}`;

describe('MedicalDocumentRepository.getDocumentsByPatientId', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('replaces the stored public URL with a signed URL for the same object', async () => {
        order.mockResolvedValue({ data: [row('a', publicUrl('p1/a.jpg'))], error: null });
        createSignedUrls.mockResolvedValue({ data: [{ path: 'p1/a.jpg', signedUrl: 'https://signed/a', error: null }], error: null });

        const docs = await medicalDocumentRepository.getDocumentsByPatientId('p1');

        expect(createSignedUrls).toHaveBeenCalledWith(['p1/a.jpg'], 3600);
        expect(docs[0].url).toBe('https://signed/a');
    });

    it('keeps the stored URL when signing fails', async () => {
        order.mockResolvedValue({ data: [row('a', publicUrl('p1/a.jpg'))], error: null });
        createSignedUrls.mockResolvedValue({ data: null, error: { message: 'boom' } });

        const docs = await medicalDocumentRepository.getDocumentsByPatientId('p1');

        expect(docs[0].url).toBe(publicUrl('p1/a.jpg'));
    });

    it('does not call storage when there are no documents', async () => {
        order.mockResolvedValue({ data: [], error: null });

        expect(await medicalDocumentRepository.getDocumentsByPatientId('p1')).toEqual([]);
        expect(createSignedUrls).not.toHaveBeenCalled();
    });
});
