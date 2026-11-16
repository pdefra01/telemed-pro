import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminLayout from '../AdminLayout';
import { LightSurface } from '../LightSurface';
import { User } from '../../../types';

// `dark:` styles follow the `dark` / `light` scope classes (src/index.css), not the OS theme.
describe('theme scope', () => {
  it('turns the dark scope on for the whole admin layout', () => {
    const { container } = render(
      <MemoryRouter>
        <AdminLayout user={{ id: 'a', name: 'admin', email: 'a@test.com', role: 'admin' } as User} onLogout={() => {}}>
          <p>contenido</p>
        </AdminLayout>
      </MemoryRouter>
    );
    expect(container.firstElementChild).toHaveClass('dark');
  });

  it('turns it back off inside the light surface', () => {
    render(<LightSurface><p>contenido</p></LightSurface>);
    expect(screen.getByTestId('light-surface')).toHaveClass('light');
  });
});
