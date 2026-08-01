import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LogHistory, type LogHistoryEntry } from '../log-history';

const ENTRIES: LogHistoryEntry[] = [
  { id: 'a', title: '80,0 kg', subtitle: '19 mai' },
  { id: 'b', title: '79,4 kg', subtitle: '18 mai' },
];

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
      emptyLabel="Nenhuma pesagem nos últimos 30 dias."
      confirmLabel="Apagar esta pesagem?"
      {...props}
    />,
  );
  return { onEdit, onDelete, onRetry };
}

describe('LogHistory', () => {
  it('renders one row per entry, with value and date', () => {
    renderHistory();

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('80,0 kg')).toBeInTheDocument();
    expect(screen.getByText('18 mai')).toBeInTheDocument();
  });

  it('calls onEdit with the entry of the row that was clicked', async () => {
    const user = userEvent.setup();
    const { onEdit } = renderHistory();

    await user.click(screen.getByRole('button', { name: 'Editar registro de 18 mai' }));

    expect(onEdit).toHaveBeenCalledWith(ENTRIES[1]);
  });

  // O caso que impede a confirmação de virar enfeite: um toque na lixeira não
  // pode apagar nada por conta própria.
  it('does not call onDelete on the first click — it only asks', async () => {
    const user = userEvent.setup();
    const { onDelete } = renderHistory();

    await user.click(screen.getByRole('button', { name: 'Apagar registro de 19 mai' }));

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByText('Apagar esta pesagem?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^apagar$/i })).toBeInTheDocument();
  });

  it('calls onDelete only after the confirmation is accepted', async () => {
    const user = userEvent.setup();
    const { onDelete } = renderHistory();

    await user.click(screen.getByRole('button', { name: 'Apagar registro de 19 mai' }));
    await user.click(screen.getByRole('button', { name: /^apagar$/i }));

    expect(onDelete).toHaveBeenCalledWith(ENTRIES[0]);
  });

  it('drops the confirmation and deletes nothing when the user cancels', async () => {
    const user = userEvent.setup();
    const { onDelete } = renderHistory();

    await user.click(screen.getByRole('button', { name: 'Apagar registro de 19 mai' }));
    await user.click(screen.getByRole('button', { name: /^cancelar$/i }));

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByText('Apagar esta pesagem?')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apagar registro de 19 mai' })).toBeInTheDocument();
  });

  it('announces the question and moves focus to the confirm button', async () => {
    const user = userEvent.setup();
    renderHistory();

    await user.click(screen.getByRole('button', { name: 'Apagar registro de 19 mai' }));

    expect(screen.getByRole('status')).toHaveTextContent('Apagar esta pesagem? 80,0 kg, 19 mai.');
    expect(screen.getByRole('button', { name: /^apagar$/i })).toHaveFocus();
  });

  it('freezes the row whose deletion is in flight', () => {
    renderHistory({ pendingId: 'a' });

    expect(screen.getByRole('button', { name: 'Editar registro de 19 mai' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Apagar registro de 19 mai' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Editar registro de 18 mai' })).toBeEnabled();
  });

  it('marks the row being edited as pressed', () => {
    renderHistory({ editingId: 'b' });

    expect(screen.getByRole('button', { name: 'Editar registro de 18 mai' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('shows the empty label when there is nothing to list', () => {
    renderHistory({ entries: [] });

    expect(screen.getByText('Nenhuma pesagem nos últimos 30 dias.')).toBeInTheDocument();
  });

  it('offers a retry when the list fails to load', async () => {
    const user = userEvent.setup();
    const { onRetry } = renderHistory({ entries: [], isError: true });

    await user.click(screen.getByRole('button', { name: /tentar novamente/i }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
