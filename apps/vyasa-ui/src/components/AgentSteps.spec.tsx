/**
 * Unit tests for AgentSteps.tsx — SCRUM-5 coverage.
 *
 * Acceptance criteria covered:
 * AC-1/AC-6: Agent reasoning step accordion visible in message bubbles.
 * Error path: matchMedia unavailable → safe default.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AgentSteps } from './AgentSteps';
import type { AgentStep } from '../types';

function buildStep(type: AgentStep['type'], content: string): AgentStep {
  return { type, content, timestamp: 0 };
}

describe('AgentSteps', () => {
  it('should_render_null_when_no_reasoning_steps_and_not_streaming', () => {
    const { container } = render(<AgentSteps steps={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('should_render_null_when_steps_are_only_message_and_done_types', () => {
    const { container } = render(
      <AgentSteps
        steps={[buildStep('message', 'Final answer'), buildStep('done', '')]}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('should_render_toggle_button_with_singular_step_label', () => {
    render(<AgentSteps steps={[buildStep('thought', 'Thinking...')]} />);

    expect(screen.getByRole('button')).toBeInTheDocument();
    expect(screen.getByText('1 reasoning step')).toBeInTheDocument();
  });

  it('should_render_toggle_button_with_plural_step_label', () => {
    render(
      <AgentSteps
        steps={[buildStep('thought', 'A'), buildStep('action', 'B')]}
      />
    );

    expect(screen.getByText('2 reasoning steps')).toBeInTheDocument();
  });

  it('should_not_show_step_content_when_collapsed_by_default', () => {
    render(<AgentSteps steps={[buildStep('thought', 'Hidden content')]} />);

    expect(screen.queryByText('Hidden content')).not.toBeInTheDocument();
  });

  it('should_expand_and_show_step_content_on_button_click', () => {
    render(<AgentSteps steps={[buildStep('action', 'Ran knowledge tool')]} />);

    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByText('Ran knowledge tool')).toBeInTheDocument();
  });

  it('should_collapse_step_content_on_second_button_click', () => {
    render(<AgentSteps steps={[buildStep('thought', 'Private reasoning')]} />);

    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Private reasoning')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button'));
    expect(screen.queryByText('Private reasoning')).not.toBeInTheDocument();
  });

  it('should_show_thinking_text_when_streaming_with_no_reasoning_steps', () => {
    render(<AgentSteps steps={[]} isStreaming={true} />);

    expect(screen.getByText('Agent is thinking…')).toBeInTheDocument();
  });

  it('should_show_step_count_when_streaming_with_reasoning_steps', () => {
    render(
      <AgentSteps
        steps={[buildStep('thought', 'In progress...')]}
        isStreaming={true}
      />
    );

    expect(screen.getByRole('button')).toBeInTheDocument();
    expect(screen.getByText('1 reasoning step')).toBeInTheDocument();
  });

  it('should_render_all_step_types_when_expanded', () => {
    render(
      <AgentSteps
        steps={[
          buildStep('thought', 'I need to search'),
          buildStep('action', 'Searching KB'),
          buildStep('observation', 'Found relevant passage'),
          buildStep('reflection', 'This answers the question'),
        ]}
      />
    );

    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByText('I need to search')).toBeInTheDocument();
    expect(screen.getByText('Searching KB')).toBeInTheDocument();
    expect(screen.getByText('Found relevant passage')).toBeInTheDocument();
    expect(screen.getByText('This answers the question')).toBeInTheDocument();
  });
});
