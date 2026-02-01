# Decision Refinement Engine

A [Toolhouse](https://app.toolhouse.ai)–powered app that runs any idea through a **multi-agent, role-based debate** to produce a clear, defensible, execution-ready plan. Multiple agents take on real roles (e.g. software engineer, sales) — each with an Adversary and an Ally — and debate your idea before a synthesizer produces the final plan.

## Prerequisites

- **Node.js** 18+ (20.19+ or 22.12+ recommended for the frontend)
- **npm** (comes with Node.js)

## Setup

### 1. Clone and install dependencies

```bash
# Clone the repo (if you haven't already)
cd pdd-hackathon-toolhouse

# Install root dependencies (includes Toolhouse CLI)
npm install
```

### 2. Create a Toolhouse account and API key

1. Go to [app.toolhouse.ai](https://app.toolhouse.ai)
2. Sign up or log in
3. Open **Settings** → **API Keys**
4. Create a new API key and copy it

### 3. Configure Toolhouse authentication

Create a file named `.toolhouse` in your home directory with your API key:

**macOS / Linux:**
```bash
echo "TOOLHOUSE_API_KEY=your_api_key_here" > ~/.toolhouse
```

**Windows (PowerShell):**
```powershell
"TOOLHOUSE_API_KEY=your_api_key_here" | Out-File -FilePath "$env:USERPROFILE\.toolhouse" -Encoding utf8
```

Replace `your_api_key_here` with your actual API key.

**Alternative:** Set the `TOOLHOUSE_API_KEY` environment variable instead.

### 4. Deploy agents and configure frontend

Run the setup script. It deploys all three agents, captures their URLs, and creates `app/.env`:

```bash
npm run setup:env
```

This will:
1. Deploy the orchestrator, debater, and synthesizer agents to Toolhouse
2. Parse the URLs from each deploy output
3. Create `app/.env` and `app/.env.example` with your agent URLs

Make sure you're authenticated first (step 3). The script uses your `TOOLHOUSE_API_KEY`.

### 5. Install frontend dependencies and run

```bash
cd app
npm install
npm run dev
```

Open the URL shown in the terminal (typically http://localhost:5173).

## Using the app

1. **Your idea** — Paste your idea (product feature, initiative, policy, launch plan, etc.)
2. **Non-negotiables** *(optional)* — Requirements that cannot be compromised
3. **Industry** *(optional)* — e.g. SaaS, healthcare
4. **Constraints** *(optional)* — e.g. budget, timeline
5. **Risk tolerance** *(optional)* — e.g. conservative, bold

Click **Refine this idea**. The app will:
1. Assemble relevant roles
2. Run adversaries (stress-test the idea)
3. Run allies (add mitigations)
4. Synthesize a final plan (improved idea, risk register, MVP plan, KPIs, verdict)

Hover or tap the info icon next to each field to see what it does and how it affects the output.

## Architecture

| Agent | Role |
|-------|------|
| **Orchestrator** | Decides which roles should evaluate the idea |
| **Debater** | One agent, called per role and perspective (adversary or ally) |
| **Synthesizer** | Produces the final plan from the debate |

Flow: Orchestrator → Adversaries (all roles) → Allies (all roles) → Synthesizer

## Project structure

| Path | Purpose |
|------|---------|
| `orchestrator.yaml` | Agent that decides roles |
| `debater.yaml` | Agent that debates as adversary or ally |
| `synthesizer.yaml` | Agent that produces the final plan |
| `agent.yaml` | Legacy single-agent config (optional) |
| `app/` | React frontend |
| `app/env.template` | Template showing required env vars |
| `app/.env` | Frontend config (agent URLs) — created by `npm run setup:env` |
| `scripts/setup-env.js` | Script to create `app/.env` with your URLs |

## Commands

| Command | Purpose |
|---------|---------|
| `npm run deploy:all` | Deploy all three agents (run from project root) |
| `npm run setup:env` | Deploy all agents, capture URLs, create `app/.env` and `app/.env.example` |
| `npx th deploy orchestrator.yaml` | Deploy orchestrator only |
| `npx th deploy debater.yaml` | Deploy debater only |
| `npx th deploy synthesizer.yaml` | Deploy synthesizer only |
| `cd app && npm run dev` | Run frontend dev server |
| `cd app && npm run build` | Build frontend for production |

## Troubleshooting

- **"Missing script: deploy:all"** — Run `npm run deploy:all` from the **project root**, not from inside `app/`
- **"Failed to fetch API keys configuration" / 401** — Check that `~/.toolhouse` exists and contains a valid `TOOLHOUSE_API_KEY`
- **"Set VITE_ORCHESTRATOR_URL..."** — Run `npm run setup:env` to deploy agents and create `app/.env`
- **Agent deployment fails (missing variable)** — Redeploy after updating the agent yaml files

## Resources

- [Toolhouse Docs](https://docs.toolhouse.ai/toolhouse/)
- [Toolhouse App](https://app.toolhouse.ai)
- [Th File Reference](https://docs.toolhouse.ai/toolhouse/advanced-concepts/build-agents-with-the-th-file)
