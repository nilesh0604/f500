/**
 * Unit tests for ChatPage.tsx — overscroll-contain on message list — SCRUM-5.
 *
 * Error path: Pull-to-refresh gesture must be contained within the scroll
 * container and not bubble up to the browser chrome (AC-7 / Error path 5).
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ChatPage } from './ChatPage';

describe('ChatPage — overscroll-contain', () => {
  it('should_apply_overscroll_contain_to_message_list', () => {
    const { container } = render(
      <ChatPage
        messages={[]}
        isLoading={false}
        onSend={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const messageList = container.querySelector('[role="log"]') as HTMLElement;
    expect(messageList).not.toBeNull();
    // overscroll-contain prevents pull-to-refresh from bubbling to browser chrome
    expect(messageList.className).toContain('overscroll-contain');
  });

  it('should_render_provided_messages_instead_of_welcome_when_messages_non_empty', () => {
    const messages = [
      {
        id: 'msg-1',
        role: 'user' as const,
        content: 'Tell me about Yudhishthira',
        timestamp: Date.now(),
      },
    ];
    const { container } = render(
      <ChatPage
        messages={messages}
        isLoading={false}
        onSend={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const log = container.querySelector('[role="log"]') as HTMLElement;
    expect(log.textContent).toContain('Tell me about Yudhishthira');
    expect(log.textContent).not.toContain('Namaste! I am Vyasa');
  });
});
