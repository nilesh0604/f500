/**
 * Unit tests for MessageBubble.tsx responsive width + break-words — SCRUM-5.
 *
 * Acceptance criteria covered:
 * AC-3: User bubble max-w-[90%] mobile / md:max-w-[75%] desktop.
 *        Assistant bubble max-w-[90%] mobile / md:max-w-[85%] desktop.
 * Error path: Long unbroken content must not overflow the container.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageBubble } from './MessageBubble';
import type { ChatMessage } from '../types';

/** Build a minimal ChatMessage fixture. */
function buildMessage(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'msg-1',
    role: 'user',
    content: 'Test content',
    timestamp: 1_700_000_000_000,
    ...overrides,
  };
}

describe('MessageBubble — responsive changes', () => {
  it('should_apply_mobile_max_width_to_user_bubble', () => {
    render(
      <MessageBubble
        message={buildMessage({ role: 'user', content: 'Hello' })}
      />
    );

    const bubble = screen.getByText('Hello');
    // Mobile max-width applied via Tailwind — both classes must be present
    expect(bubble.className).toContain('max-w-[90%]');
    expect(bubble.className).toContain('md:max-w-[75%]');
  });

  it('should_apply_mobile_max_width_to_assistant_bubble', () => {
    // The outer wrapper (flex gap-2.5) holds the max-width constraint
    const { container } = render(
      <MessageBubble
        message={buildMessage({ role: 'assistant', content: 'Namaste!' })}
      />
    );
    const outerWrapper = container.querySelector(
      '.flex.gap-2\\.5'
    ) as HTMLElement;
    expect(outerWrapper).not.toBeNull();
    expect(outerWrapper.className).toContain('max-w-[90%]');
    expect(outerWrapper.className).toContain('md:max-w-[85%]');
  });

  it('should_apply_break_words_to_assistant_content', () => {
    // A 200-char string with no whitespace mimics a long URL / code snippet
    const longContent = 'A'.repeat(200);
    const { container } = render(
      <MessageBubble
        message={buildMessage({ role: 'assistant', content: longContent })}
      />
    );

    const proseDiv = container.querySelector('.prose') as HTMLElement;
    expect(proseDiv).not.toBeNull();
    expect(proseDiv.className).toContain('break-words');
  });

  it('should_render_typing_dots_when_assistant_is_streaming_without_content', () => {
    const { container } = render(
      <MessageBubble
        message={buildMessage({
          role: 'assistant',
          content: '',
          isStreaming: true,
        })}
      />
    );

    // Three bouncing dots indicate the agent is still generating
    const bouncingDots = container.querySelectorAll('.animate-bounce');
    expect(bouncingDots.length).toBeGreaterThan(0);
  });

  it('should_render_streaming_cursor_when_assistant_has_content_and_is_streaming', () => {
    const { container } = render(
      <MessageBubble
        message={buildMessage({
          role: 'assistant',
          content: 'Partial answer…',
          isStreaming: true,
        })}
      />
    );

    // Blinking cursor span is rendered alongside streamed content
    const cursor = container.querySelector('.animate-pulse');
    expect(cursor).not.toBeNull();
  });

  it('should_render_error_message_when_assistant_message_has_error', () => {
    render(
      <MessageBubble
        message={buildMessage({
          role: 'assistant',
          content: '',
          error: 'Failed to load response from service',
        })}
      />
    );

    expect(
      screen.getByText('Failed to load response from service')
    ).toBeInTheDocument();
  });

  it('should_render_agent_steps_toggle_when_message_has_reasoning_steps', () => {
    render(
      <MessageBubble
        message={buildMessage({
          role: 'assistant',
          content: 'The answer is here',
          agentSteps: [
            { type: 'thought', content: 'Searching KB…', timestamp: 0 },
          ],
        })}
      />
    );

    // AgentSteps accordion toggle button is rendered
    expect(screen.getByRole('button')).toBeInTheDocument();
    expect(screen.getByText('1 reasoning step')).toBeInTheDocument();
  });
});
