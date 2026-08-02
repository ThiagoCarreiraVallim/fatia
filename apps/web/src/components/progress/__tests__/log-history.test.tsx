import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LogHistory, type LogHistoryEntry } from '../log-history';

// Duas entradas no mesmo dia de propósito: é o caso normal da água, e era onde
// os rótulos acessíveis se repetiam quando só carregavam a data.
const ENTRIES: LogHistoryEntry[] = [
  { id: 'a', title: '500 mL', subtitle: '17 mai · 11:00' },
  { id: 'b', title: '250 mL', subtitle: '17 mai · 15:30' },
];

const EDIT_A = 'Editar registro de 500 mL, 17 mai · 11:00';
const EDIT_B = 'Editar registro de 250 mL, 17 mai · 15:30';
const DELETE_A = 'Apagar registro de 500 mL, 17 mai · 11:00';

function renderHistory(props: Partial<Parameters<typeof LogHistory>[0]> = {}) {
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  const onRetry = vi.fn();
  render(
    <LogHistory
      entries={ENTRIES}
      isLoading={false}
      isError={false}
      onRetry={onRetry}
      editingId={null}
      onEdit={onEdit}
      onDelete={onDelete}
      pendingId={null}
      isDeleting={false}
      emptyLabel="Nenhum registro de água nos últimos 7 dias."
      confirmLabel="Apagar este registro de água?"
      {...props}
    />,
  );
  return { onEdit, onDelete, onRetry };
}

describe('LogHistory', () => {
  it('renders one row per entry, with value and date', () => {
    renderHistory();

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('500 mL')).toBeInTheDocument();
    expect(screen.getByText('17 mai · 15:30')).toBeInTheDocument();
  });

  // Sem o valor no rótulo, duas linhas do mesmo dia viram dois botões
  // "Apagar registro de 17 mai" idênticos — e no leitor de tela não há como
  // saber qual copo se está prestes a apagar.
  it('gives every row a distinct accessible name, even on the same day', () => {
    renderHistory();

    const names = screen
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'))
      .filter((name): name is string => name !== null);

    expect(names).toHaveLength(4);
    expect(new Set(names).size).toBe(4);
    expect(names).toContain(DELETE_A);
  });

  it('calls onEdit with the entry of the row that was clicked', async () => {
    const user = userEvent.setup();
    const { onEdit } = renderHistory();

    await user.click(screen.getByRole('button', { name: EDIT_B }));

    expect(onEdit).toHaveBeenCalledWith(ENTRIES[1]);
  });

  // O caso que impede a confirmação de virar enfeite: um toque na lixeira não
  // pode apagar nada por conta própria.
  it('does not call onDelete on the first click — it only asks', async () => {
    const user = userEvent.setup();
    const { onDelete } = renderHistory();

    await user.click(screen.getByRole('button', { name: DELETE_A }));

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByText('Apagar este registro de água?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^apagar$/i })).toBeInTheDocument();
  });

  it('calls onDelete only after the confirmation is accepted', async () => {
    const user = userEvent.setup();
    const { onDelete } = renderHistory();

    await user.click(screen.getByRole('button', { name: DELETE_A }));
    await user.click(screen.getByRole('button', { name: /^apagar$/i }));

    expect(onDelete).toHaveBeenCalledWith(ENTRIES[0]);
  });

  it('drops the confirmation and deletes nothing when the user cancels', async () => {
    const user = userEvent.setup();
    const { onDelete } = renderHistory();

    await user.click(screen.getByRole('button', { name: DELETE_A }));
    await user.click(screen.getByRole('button', { name: /^cancelar$/i }));

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByText('Apagar este registro de água?')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: DELETE_A })).toBeInTheDocument();
  });

  it('announces the question and moves focus to the confirm button', async () => {
    const user = userEvent.setup();
    renderHistory();

    await user.click(screen.getByRole('button', { name: DELETE_A }));

    expect(screen.getByRole('status')).toHaveTextContent(
      'Apagar este registro de água? 500 mL, 17 mai · 11:00.',
    );
    expect(screen.getByRole('button', { name: /^apagar$/i })).toHaveFocus();
  });

  // Uma segunda exclusão em voo faz o observer da mutação migrar, e o erro da
  // primeira nunca chega à tela.
  it('freezes every row while a deletion is in flight, not just the pending one', () => {
    renderHistory({ pendingId: 'a', isDeleting: true });

    expect(screen.getByRole('button', { name: DELETE_A })).toBeDisabled();
    expect(screen.getByRole('button', { name: EDIT_A })).toBeDisabled();
    // A outra linha é a que importa: era por ela que a segunda exclusão saía.
    expect(
      screen.getByRole('button', { name: 'Apagar registro de 250 mL, 17 mai · 15:30' }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: EDIT_B })).toBeDisabled();
  });

  it('marks the row being edited as pressed', () => {
    renderHistory({ editingId: 'b' });

    expect(screen.getByRole('button', { name: EDIT_B })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows the empty label when there is nothing to list', () => {
    renderHistory({ entries: [] });

    expect(screen.getByText('Nenhum registro de água nos últimos 7 dias.')).toBeInTheDocument();
  });

  it('offers a retry when the list fails to load', async () => {
    const user = userEvent.setup();
    const { onRetry } = renderHistory({ entries: [], isError: true });

    await user.click(screen.getByRole('button', { name: /tentar novamente/i }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
