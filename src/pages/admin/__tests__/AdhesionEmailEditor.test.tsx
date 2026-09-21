import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { AdhesionEmailEditor, isValidEmailInput } from '../AdhesionEmailEditor';

describe('isValidEmailInput', () => {
  it('accepts a trimmed valid email and rejects the rest', () => {
    expect(isValidEmailInput(' a@test.com ')).toBe(true);
    expect(isValidEmailInput('a@test')).toBe(false);
    expect(isValidEmailInput('')).toBe(false);
    expect(isValidEmailInput('a b@test.com')).toBe(false);
  });
});

describe('AdhesionEmailEditor', () => {
  it('shows no edit control when the request is not pending', () => {
    render(<AdhesionEmailEditor email="a@test.com" editable={false} onSave={vi.fn()} />);
    expect(screen.getByText('a@test.com')).toBeTruthy();
    expect(screen.queryByLabelText('Editar email')).toBeNull();
  });

  it('saves the trimmed email, then returns to display mode', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<AdhesionEmailEditor email="a@test.com" editable onSave={onSave} />);
    fireEvent.click(screen.getByLabelText('Editar email'));
    fireEvent.change(screen.getByLabelText('Nuevo email'), { target: { value: '  b@test.com ' } });
    fireEvent.click(screen.getByText('Guardar'));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('b@test.com'));
    await waitFor(() => expect(screen.queryByLabelText('Nuevo email')).toBeNull());
  });

  it('does not call onSave for an invalid email and disables Guardar', () => {
    const onSave = vi.fn();
    render(<AdhesionEmailEditor email="a@test.com" editable onSave={onSave} />);
    fireEvent.click(screen.getByLabelText('Editar email'));
    fireEvent.change(screen.getByLabelText('Nuevo email'), { target: { value: 'nope' } });
    expect((screen.getByText('Guardar') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByText('Guardar'));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('stays in edit mode when onSave rejects (parent shows the toast)', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('Ese email ya pertenece a otra cuenta.'));
    render(<AdhesionEmailEditor email="a@test.com" editable onSave={onSave} />);
    fireEvent.click(screen.getByLabelText('Editar email'));
    fireEvent.change(screen.getByLabelText('Nuevo email'), { target: { value: 'b@test.com' } });
    fireEvent.click(screen.getByText('Guardar'));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(screen.getByLabelText('Nuevo email')).toBeTruthy();
  });

  it('Cancelar discards the draft', () => {
    render(<AdhesionEmailEditor email="a@test.com" editable onSave={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Editar email'));
    fireEvent.change(screen.getByLabelText('Nuevo email'), { target: { value: 'b@test.com' } });
    fireEvent.click(screen.getByText('Cancelar'));
    expect(screen.queryByLabelText('Nuevo email')).toBeNull();
    fireEvent.click(screen.getByLabelText('Editar email'));
    expect((screen.getByLabelText('Nuevo email') as HTMLInputElement).value).toBe('a@test.com');
  });
});
