import { useState, useRef } from 'react'
import ReactMarkdown from 'react-markdown'

const FIELD_INFO: Record<string, { label: string; description: string; impact: string }> = {
  idea: {
    label: 'Your idea',
    description: 'The core proposal to refine — a product feature, business change, initiative, policy, or launch plan.',
    impact: 'This is the main input. The debate and final plan are built entirely around this.',
  },
  industry: {
    label: 'Industry',
    description: 'Your sector or domain (e.g. SaaS, healthcare, fintech).',
    impact: 'Shapes which roles are selected and how risks and mitigations are framed in the debate.',
  },
  constraints: {
    label: 'Constraints',
    description: 'Hard limits you must work within — budget, timeline, compliance, tech stack, headcount.',
    impact: 'Debaters and the synthesizer will keep suggestions within these bounds.',
  },
  risk_tolerance: {
    label: 'Risk tolerance',
    description: 'How much risk you\'re willing to accept (e.g. conservative, moderate, bold).',
    impact: 'Affects the verdict and how aggressively mitigations are weighted in the final plan.',
  },
  non_negotiables: {
    label: 'Non-negotiables',
    description: 'Requirements that cannot be compromised. Deal-breakers that no alternative can violate.',
    impact: 'The plan and any "better path forward" will treat these as fixed. Violations are ruled out.',
  },
}

function InfoIcon({ fieldId }: { fieldId: keyof typeof FIELD_INFO }) {
  const [open, setOpen] = useState(false)
  const info = FIELD_INFO[fieldId]
  if (!info) return null
  return (
    <span className="group relative inline-flex ml-1.5 align-middle">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        tabIndex={0}
        className="cursor-help rounded-full p-0.5 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
        aria-label={`Info about ${info.label}`}
        aria-expanded={open}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-4 h-4 text-slate-500 hover:text-slate-400 transition-colors"
        >
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      <span
        className={`absolute left-0 bottom-full mb-1.5 w-64 px-3 py-2 text-xs text-slate-200 bg-slate-800 border border-slate-600 rounded-lg shadow-xl transition-all z-20 ${
          open ? 'opacity-100 visible' : 'opacity-0 invisible group-hover:opacity-100 group-hover:visible'
        }`}
      >
        <span className="font-medium text-slate-100 block mb-0.5">{info.label}</span>
        <span className="block text-slate-400 mb-1">{info.description}</span>
        <span className="block text-amber-400/90 text-[11px]">How it affects output: {info.impact}</span>
      </span>
    </span>
  )
}

const ORCHESTRATOR_URL = import.meta.env.VITE_ORCHESTRATOR_URL || ''
const DEBATER_URL = import.meta.env.VITE_DEBATER_URL || ''
const SYNTHESIZER_URL = import.meta.env.VITE_SYNTHESIZER_URL || ''

type Stage = 'idle' | 'orchestrator' | 'debate_adversaries' | 'debate_allies' | 'synthesizer' | 'done'

async function callAgent(
  url: string,
  body: { message?: string; vars: Record<string, string | undefined> },
  signal?: AbortSignal
): Promise<string> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) throw new Error(`Request failed: ${res.status}`)
  const reader = res.body?.getReader()
  if (!reader) return ''
  const decoder = new TextDecoder()
  let text = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    text += decoder.decode(value, { stream: true })
  }
  return text
}

async function callAgentStreaming(
  url: string,
  body: { message?: string; vars: Record<string, string | undefined> },
  onChunk: (chunk: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) throw new Error(`Request failed: ${res.status}`)
  const reader = res.body?.getReader()
  if (!reader) return
  const decoder = new TextDecoder()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    onChunk(decoder.decode(value, { stream: true }))
  }
}

function parseRoles(text: string): string[] {
  try {
    const jsonMatch = text.match(/\{[\s\S]*"roles"[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      if (Array.isArray(parsed.roles)) return parsed.roles
    }
  } catch {
    // fallback: look for list-like patterns
    const listMatch = text.match(/\[([^\]]+)\]/)
    if (listMatch) {
      return listMatch[1].split(',').map((s) => s.trim().replace(/^["']|["']$/g, ''))
    }
  }
  return []
}

function App() {
  const [idea, setIdea] = useState('')
  const [industry, setIndustry] = useState('')
  const [constraints, setConstraints] = useState('')
  const [riskTolerance, setRiskTolerance] = useState('')
  const [nonNegotiables, setNonNegotiables] = useState('')
  const [stage, setStage] = useState<Stage>('idle')
  const [roles, setRoles] = useState<string[]>([])
  const [debateTranscript, setDebateTranscript] = useState('')
  const [synthesis, setSynthesis] = useState('')
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const hasUrls = ORCHESTRATOR_URL && DEBATER_URL && SYNTHESIZER_URL

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!idea.trim()) {
      setError('Enter your idea.')
      return
    }
    if (!hasUrls) {
      setError('Set VITE_ORCHESTRATOR_URL, VITE_DEBATER_URL, and VITE_SYNTHESIZER_URL in .env')
      return
    }

    setError(null)
    setRoles([])
    setDebateTranscript('')
    setSynthesis('')
    setStage('orchestrator')
    abortRef.current = new AbortController()
    const signal = abortRef.current.signal

    try {
      // 1. Orchestrator: decide roles
      const orchestratorResponse = await callAgent(
        ORCHESTRATOR_URL,
        {
          message: `Determine which roles should evaluate this idea:\n\n${idea}${nonNegotiables ? `\n\nNon-negotiables: ${nonNegotiables}` : ''}`,
          vars: {
            idea,
            industry: industry || undefined,
            constraints: constraints || undefined,
            risk_tolerance: riskTolerance || undefined,
            non_negotiables: nonNegotiables || undefined,
          },
        },
        signal
      )
      const parsedRoles = parseRoles(orchestratorResponse)
      const finalRoles = parsedRoles.length >= 2 ? parsedRoles : ['product_manager', 'engineering', 'operations']
      setRoles(finalRoles)
      setStage('debate_adversaries')

      // 2. Adversaries (all roles, parallel)
      const adversaryPromises = finalRoles.map((role) =>
        callAgent(
          DEBATER_URL,
          {
            message: `Idea to evaluate:\n${idea}\n\nDebate so far:\n`,
            vars: {
              idea,
              role,
              perspective: 'adversary',
              industry: industry || '',
              constraints: constraints || '',
              non_negotiables: nonNegotiables || '',
              debate_so_far: '',
            },
          },
          signal
        )
      )
      const adversaryResponses = await Promise.all(adversaryPromises)
      const adversaryBlock = adversaryResponses.join('\n\n')
      setDebateTranscript(adversaryBlock)
      setStage('debate_allies')

      // 3. Allies (all roles, parallel, with adversary context)
      const allyPromises = finalRoles.map((role) =>
        callAgent(
          DEBATER_URL,
          {
            message: `Idea to evaluate:\n${idea}\n\nDebate so far (adversary responses — respond to these):\n${adversaryBlock}`,
            vars: {
              idea,
              role,
              perspective: 'ally',
              industry: industry || '',
              constraints: constraints || '',
              non_negotiables: nonNegotiables || '',
              debate_so_far: adversaryBlock,
            },
          },
          signal
        )
      )
      const allyResponses = await Promise.all(allyPromises)
      const fullTranscript = adversaryBlock + '\n\n' + allyResponses.join('\n\n')
      setDebateTranscript(fullTranscript)
      setStage('synthesizer')

      // 4. Synthesizer: stream final plan
      setSynthesis('')
      await callAgentStreaming(
        SYNTHESIZER_URL,
        {
          message: `Original idea:\n${idea}\n\nNon-negotiables:\n${nonNegotiables || '(none)'}\n\nFull debate transcript:\n${fullTranscript}`,
          vars: {
            idea,
            debate_transcript: fullTranscript,
            non_negotiables: nonNegotiables || '',
          },
        },
        (chunk) => setSynthesis((prev) => prev + chunk),
        signal
      )
      setStage('done')
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError((err as Error).message)
      }
    } finally {
      setStage((s) => (s === 'synthesizer' ? 'done' : s))
      abortRef.current = null
    }
  }

  function handleCancel() {
    if (abortRef.current) abortRef.current.abort()
  }

  const stageLabel: Record<Stage, string> = {
    idle: '',
    orchestrator: 'Assembling roles…',
    debate_adversaries: 'Round 1: Adversaries…',
    debate_allies: 'Round 2: Allies…',
    synthesizer: 'Synthesizing plan…',
    done: 'Done',
  }

  const isRunning = stage !== 'idle' && stage !== 'done'

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <header className="mb-14">
          <h1 className="text-3xl font-semibold tracking-tight text-amber-400/95">
            Decision Refinement Engine
          </h1>
          <p className="mt-2 text-slate-400 text-lg max-w-xl">
            Paste any idea and run it through a multi-agent, role-based debate. Real agents — adversaries and allies per role — produce a clear, defensible, execution-ready plan.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="idea" className="flex items-center text-sm font-medium text-slate-300 mb-2">
              Your idea
              <InfoIcon fieldId="idea" />
            </label>
            <textarea
              id="idea"
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder="e.g. Add a real-time booking system for our CRM SaaS..."
              rows={5}
              className="w-full px-4 py-3 bg-slate-900/80 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 resize-none"
              disabled={isRunning}
            />
          </div>

          <div>
            <label htmlFor="non_negotiables" className="flex items-center text-sm font-medium text-slate-400 mb-1.5">
              Non-negotiables
              <InfoIcon fieldId="non_negotiables" />
            </label>
            <input
              id="non_negotiables"
              type="text"
              value={nonNegotiables}
              onChange={(e) => setNonNegotiables(e.target.value)}
              placeholder="e.g. Must launch in Q1, no new hires, stay within compliance"
              className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-md text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500/50 text-sm"
              disabled={isRunning}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="industry" className="flex items-center text-sm font-medium text-slate-400 mb-1.5">
                Industry
                <InfoIcon fieldId="industry" />
              </label>
              <input
                id="industry"
                type="text"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                placeholder="e.g. SaaS, healthcare"
                className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-md text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500/50 text-sm"
                disabled={isRunning}
              />
            </div>
            <div>
              <label htmlFor="constraints" className="flex items-center text-sm font-medium text-slate-400 mb-1.5">
                Constraints
                <InfoIcon fieldId="constraints" />
              </label>
              <input
                id="constraints"
                type="text"
                value={constraints}
                onChange={(e) => setConstraints(e.target.value)}
                placeholder="e.g. budget, timeline"
                className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-md text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500/50 text-sm"
                disabled={isRunning}
              />
            </div>
            <div>
              <label htmlFor="risk" className="flex items-center text-sm font-medium text-slate-400 mb-1.5">
                Risk tolerance
                <InfoIcon fieldId="risk_tolerance" />
              </label>
              <input
                id="risk"
                type="text"
                value={riskTolerance}
                onChange={(e) => setRiskTolerance(e.target.value)}
                placeholder="e.g. conservative, bold"
                className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-md text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500/50 text-sm"
                disabled={isRunning}
              />
            </div>
          </div>

          {error && (
            <div className="px-4 py-2 bg-red-950/50 border border-red-800/50 rounded-lg text-red-300 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3 items-center">
            <button
              type="submit"
              disabled={isRunning}
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-900 font-medium rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isRunning ? 'Running…' : 'Refine this idea'}
            </button>
            {isRunning && (
              <>
                <span className="text-slate-500 text-sm">{stageLabel[stage]}</span>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-4 py-2.5 border border-slate-600 text-slate-300 hover:bg-slate-800 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </form>

        {roles.length > 0 && (
          <section className="mt-10 pt-8 border-t border-slate-800">
            <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-2">
              Assembled roles
            </h2>
            <p className="text-slate-300">
              {roles.map((r) => r.replace(/_/g, ' ')).join(' · ')}
            </p>
          </section>
        )}

        {debateTranscript && (
          <section className="mt-10 pt-8 border-t border-slate-800">
            <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4">
              Debate transcript
            </h2>
            <div className="prose prose-invert prose-sm max-w-none prose-headings:text-slate-200 prose-p:text-slate-300 prose-li:text-slate-300">
              <ReactMarkdown>{debateTranscript}</ReactMarkdown>
            </div>
          </section>
        )}

        {synthesis && (
          <section className="mt-14 pt-10 border-t border-slate-800">
            <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4">
              Final plan
            </h2>
            <div className="prose prose-invert prose-amber max-w-none prose-headings:text-slate-200 prose-p:text-slate-300 prose-li:text-slate-300 prose-strong:text-amber-400/90">
              <ReactMarkdown>{synthesis}</ReactMarkdown>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

export default App
