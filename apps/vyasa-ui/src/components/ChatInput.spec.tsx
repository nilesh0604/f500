/**
 * Unit tests for ChatInput.tsx responsive / touch-target changes — SCRUM-5.
 *
 * Acceptance criteria covered:
 * AC-4: Suggestion chips in a single horizontally-scrollable row.
 * AC-5: Send and cancel buttons meet 44×44 px minimum touch target.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatInput } from './ChatInput';

describe('ChatInput — responsive changes', () => {
  it('should_render_chips_in_horizontally_scrollable_container', () => {
    render(<ChatInput onSend={vi.fn()} onCancel={vi.fn()} isLoading={false} />);

    // All 4 suggestion chips must be present
    expect(
      screen.getByText('Who was Karna and what was his fate?')
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Explain the significance of the Bhagavad Gita in the Mahabharata.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText('What role did Draupadi play in the Kurukshetra war?')
    ).toBeInTheDocument();
    expect(
      screen.getByText('How did Bhishma earn his name and his vow?')
    ).toBeInTheDocument();

    // The container holding the chips must be horizontally scrollable
    const firstChip = screen.getByText('Who was Karna and what was his fate?');
    const chipContainer = firstChip.parentElement as HTMLElement;
    expect(chipContainer.className).toContain('overflow-x-auto');

    // Each chip must have shrink-0 so they do not collapse
    expect(firstChip.className).toContain('shrink-0');
  });

  it('should_meet_44px_touch_target_on_send_button', () => {
    render(<ChatInput onSend={vi.fn()} onCancel={vi.fn()} isLoading={false} />);

    const sendBtn = screen.getByRole('button', { name: /send message/i });
    expect(sendBtn.className).toContain('w-11');
    expect(sendBtn.className).toContain('h-11');
  });

  it('should_meet_44px_touch_target_on_cancel_button', () => {
    render(<ChatInput onSend={vi.fn()} onCancel={vi.fn()} isLoading={true} />);

    const cancelBtn = screen.getByRole('button', { name: /cancel stream/i });
    expect(cancelBtn.className).toContain('w-11');
    expect(cancelBtn.className).toContain('h-11');
  });

  it('should_not_show_chips_when_loading', () => {
    render(<ChatInput onSend={vi.fn()} onCancel={vi.fn()} isLoading={true} />);

    expect(
      screen.queryByText('Who was Karna and what was his fate?')
    ).not.toBeInTheDocument();
  });

  it('should_not_show_chips_when_text_entered', async () => {
    const user = userEvent.setup();
    render(<ChatInput onSend={vi.fn()} onCancel={vi.fn()} isLoading={false} />);

    const textarea = screen.getByRole('textbox', { name: /message input/i });
    await user.type(textarea, 'Hello');

    expect(
      screen.queryByText('Who was Karna and what was his fate?')
    ).not.toBeInTheDocument();
  });

  it('should_send_message_and_clear_input_on_send_button_click', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} onCancel={vi.fn()} isLoading={false} />);

    const textarea = screen.getByRole('textbox', { name: /message input/i });
    await user.type(textarea, 'Tell me about Arjuna');

    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    expect(onSend).toHaveBeenCalledWith('Tell me about Arjuna');
    expect(textarea).toHaveValue('');
  });

  it('should_send_message_on_enter_key_press', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} onCancel={vi.fn()} isLoading={false} />);

    const textarea = screen.getByRole('textbox', { name: /message input/i });
    await user.type(textarea, 'Who is Karna{Enter}');

    expect(onSend).toHaveBeenCalledWith('Who is Karna');
  });

  it('should_populate_textarea_when_chip_is_clicked', async () => {
    const user = userEvent.setup();
    render(<ChatInput onSend={vi.fn()} onCancel={vi.fn()} isLoading={false} />);

    await user.click(screen.getByText('Who was Karna and what was his fate?'));

    const textarea = screen.getByRole('textbox', { name: /message input/i });
    expect(textarea).toHaveValue('Who was Karna and what was his fate?');
  });
});
