import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WhatsappStatusBadge } from '../WhatsappStatusBadge';
import { whatsappStatusRepository } from '../../../repositories/WhatsappStatusRepository';

vi.mock('../../../repositories/WhatsappStatusRepository', () => ({
  whatsappStatusRepository: { getStatus: vi.fn() },
}));

const getStatus = vi.mocked(whatsappStatusRepository.getStatus);

describe('WhatsappStatusBadge', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows connected when the session is WORKING', async () => {
    getStatus.mockResolvedValue('WORKING');
    render(<WhatsappStatusBadge />);
    expect(await screen.findByText('WhatsApp conectado')).toBeInTheDocument();
  });

  it('asks to link the phone again when the session needs a QR', async () => {
    getStatus.mockResolvedValue('SCAN_QR_CODE');
    render(<WhatsappStatusBadge />);
    expect(await screen.findByText('WhatsApp: hay que vincular el celular')).toBeInTheDocument();
  });

  it('shows down for a stopped or failed session', async () => {
    getStatus.mockResolvedValue('STOPPED');
    render(<WhatsappStatusBadge />);
    expect(await screen.findByText('WhatsApp caído')).toBeInTheDocument();
  });

  it('shows no answer when the gateway is unreachable, and not configured when disabled', async () => {
    getStatus.mockResolvedValueOnce('UNREACHABLE');
    const first = render(<WhatsappStatusBadge />);
    expect(await screen.findByText('WhatsApp sin respuesta')).toBeInTheDocument();
    first.unmount();

    getStatus.mockResolvedValueOnce('NOT_CONFIGURED');
    render(<WhatsappStatusBadge />);
    expect(await screen.findByText('WhatsApp sin configurar')).toBeInTheDocument();
  });

  it('shows no answer when the status request itself fails', async () => {
    getStatus.mockRejectedValue(new Error('network'));
    render(<WhatsappStatusBadge />);
    expect(await screen.findByText('WhatsApp sin respuesta')).toBeInTheDocument();
  });
});
