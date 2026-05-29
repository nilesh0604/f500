import { useState, type JSX } from 'react';
import {
  Brain,
  Zap,
  Eye,
  CheckCircle,
  MessageSquare,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import type { AgentStep, AgentEventType } from '../types';

const STEP_META: Record<
  AgentEventType,
  { label: string; icon: React.ReactNode; color: string }
> = {
  thought: {
    label: 'Thought',
    icon: <Brain className="w-3.5 h-3.5" />,
    color: 'text-violet-600 bg-violet-50 border-violet-200',
  },
  action: {
    label: 'Action',
    icon: <Zap className="w-3.5 h-3.5" />,
    color: 'text-amber-600 bg-amber-50 border-amber-200',
  },
  observation: {
    label: 'Observation',
    icon: <Eye className="w-3.5 h-3.5" />,
    color: 'text-blue-600 bg-blue-50 border-blue-200',
  },
  reflection: {
    label: 'Reflection',
    icon: <CheckCircle className="w-3.5 h-3.5" />,
    color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
  },
  message: {
    label: 'Answer',
    icon: <MessageSquare className="w-3.5 h-3.5" />,
    color: 'text-saffron-700 bg-saffron-50 border-saffron-200',
  },
  done: {
    label: 'Done',
    icon: <CheckCircle className="w-3.5 h-3.5" />,
    color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
  },
  error: {
    label: 'Error',
    icon: <Zap className="w-3.5 h-3.5" />,
    color: 'text-red-600 bg-red-50 border-red-200',
  },
};

interface AgentStepsProps {
  steps: AgentStep[];
  isStreaming?: boolean;
}

export function AgentSteps({
  steps,
  isStreaming,
}: AgentStepsProps): JSX.Element | null {
  const [open, setOpen] = useState(false);

  const reasoningSteps = steps.filter(
    s => s.type !== 'message' && s.type !== 'done'
  );

  if (reasoningSteps.length === 0 && !isStreaming) return null;

  return (
    <div className="mt-2 mb-3">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700
          transition-colors rounded px-1 -ml-1 py-0.5"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronRight className="w-3 h-3" />
        )}
        {isStreaming && reasoningSteps.length === 0 ? (
          <span className="italic">Agent is thinking…</span>
        ) : (
          <span>
            {reasoningSteps.length} reasoning step
            {reasoningSteps.length !== 1 ? 's' : ''}
          </span>
        )}
        {isStreaming && (
          <span className="flex gap-0.5 ml-1">
            <span className="w-1 h-1 bg-saffron-500 rounded-full animate-bounce [animation-delay:0ms]" />
            <span className="w-1 h-1 bg-saffron-500 rounded-full animate-bounce [animation-delay:150ms]" />
            <span className="w-1 h-1 bg-saffron-500 rounded-full animate-bounce [animation-delay:300ms]" />
          </span>
        )}
      </button>

      {open && reasoningSteps.length > 0 && (
        <ol className="mt-2 space-y-1.5 animate-fade-in">
          {reasoningSteps.map((step, i) => {
            const meta = STEP_META[step.type] ?? STEP_META.thought;
            return (
              <li
                key={i}
                className={`flex gap-2 p-2 rounded-lg border text-xs ${meta.color}`}
              >
                <span className="mt-0.5 shrink-0">{meta.icon}</span>
                <div>
                  <span className="font-semibold mr-1">{meta.label}:</span>
                  <span className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                    {step.content}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
