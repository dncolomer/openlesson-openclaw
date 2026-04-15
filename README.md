# openLesson OpenClaw Plugin

Official [OpenClaw](https://openclaw.ai) plugin for the [openLesson](https://www.openlesson.academy) Agentic API v2.

Turn your OpenClaw agent into an openLesson-powered personal tutor with full access to learning plans, Socratic tutoring sessions, multimodal analysis, a teaching assistant, analytics, and cryptographic proofs.

## Install

```bash
openclaw plugin add dncolomer/openlesson-openclaw
```

Then set your API key:

```bash
export OPENLESSON_API_KEY=sk_...
```

Or configure it in your OpenClaw plugin settings under `open-lesson > apiKey`.

> Get your API key from [openlesson.academy/dashboard](https://www.openlesson.academy/dashboard). Requires a Pro subscription.

## What It Does

This plugin registers **33 tools** that give your agent full access to the openLesson v2 API:

### Learning Plans (8 tools)
Create AI-generated learning paths from topics or YouTube videos, view progress, adapt plans with natural language, and manage the full lifecycle.

| Tool | Description |
|------|-------------|
| `create_plan` | Generate a learning plan from a topic |
| `create_plan_from_video` | Generate a plan from a YouTube video |
| `list_plans` | List plans with filtering and pagination |
| `get_plan` | Get plan details with nodes and statistics |
| `update_plan` | Update plan title, notes, or status |
| `delete_plan` | Delete a plan and its nodes |
| `get_plan_nodes` | Get nodes with edges and graph topology |
| `adapt_plan` | AI-powered plan adaptation via natural language |

### Tutoring Sessions (11 tools)
Start sessions (standalone or linked to a plan), submit multimodal input for Socratic analysis, pause/resume/restart, and get transcripts.

| Tool | Description |
|------|-------------|
| `start_session` | Start a new tutoring session |
| `list_sessions` | List sessions with filtering |
| `get_session` | Get session details, plan, stats, and active probes |
| `analyze_session` | Submit audio/text/images for gap analysis |
| `pause_session` | Pause an active session |
| `resume_session` | Resume with a reorientation probe |
| `restart_session` | Restart with a fresh plan and opening probe |
| `end_session` | End session and generate a report |
| `list_session_probes` | List probes (active, archived, or all) |
| `get_session_plan` | Get the session's tutoring plan and steps |
| `get_session_transcript` | Get transcript (full, summary, or chunks) |

### Teaching Assistant (2 tools)
Ask contextual questions within a session without breaking the Socratic flow.

| Tool | Description |
|------|-------------|
| `ask_assistant` | Ask a question with optional conversation context |
| `get_assistant_conversation` | Retrieve conversation history |

### Analytics (3 tools)
Track learning progress at every level.

| Tool | Description |
|------|-------------|
| `get_user_analytics` | User-wide dashboard: plans, sessions, streaks, trends |
| `get_plan_analytics` | Plan progress, strongest/weakest topics, recommendations |
| `get_session_analytics` | Gap timeline, probe breakdown, transcript stats |

### Cryptographic Proofs (5 tools)
Every mutation generates a SHA-256 fingerprinted proof forming a hash chain.

| Tool | Description |
|------|-------------|
| `list_proofs` | List proofs with filtering |
| `get_proof` | Proof details with chain context and batch info |
| `verify_proof` | Recalculate fingerprint and check chain integrity |
| `anchor_proof` | Anchor a proof on Solana (simulated) |
| `get_session_proof_batch` | Get session Merkle batch |

### API Key Management (4 tools)
Manage API keys (uses session cookie auth).

| Tool | Description |
|------|-------------|
| `list_api_keys` | List all API keys |
| `create_api_key` | Create a new scoped API key |
| `revoke_api_key` | Revoke a key |
| `update_key_scopes` | Update key permissions |

## Typical Workflow

```
1. create_plan        -> Generate a learning plan for "Quantum Computing"
2. start_session      -> Start a session linked to the first node
3. analyze_session    -> Submit audio/text for Socratic analysis
4. ask_assistant      -> Ask for a hint without getting the answer
5. end_session        -> End the session and get a report
6. get_user_analytics -> Check overall learning progress
```

## Multimodal Analysis

The `analyze_session` tool accepts multiple input types in a single call:

- **Audio**: Base64-encoded webm, mp4, or ogg
- **Text**: Plain text responses
- **Images**: Base64-encoded images (png, jpg, etc.)

```json
{
  "inputs": [
    { "type": "audio", "data": "base64...", "format": "webm" },
    { "type": "text", "content": "I think the answer is..." },
    { "type": "image", "data": "base64...", "mime_type": "image/png" }
  ]
}
```

## Scoped Permissions

API keys support granular scopes:

| Scope | Access |
|-------|--------|
| `*` | All permissions (default) |
| `plans:read` / `plans:write` | Learning plans |
| `sessions:read` / `sessions:write` | Tutoring sessions |
| `analysis:write` | Session analysis |
| `assistant:read` | Teaching assistant |
| `analytics:read` | Analytics |
| `proofs:read` / `proofs:anchor` | Proof verification and anchoring |

## Configuration

| Option | Required | Default |
|--------|----------|---------|
| `apiKey` | Yes | `$OPENLESSON_API_KEY` |
| `baseUrl` | No | `https://www.openlesson.academy` |

## API Reference

See [`skill.md`](./skill.md) for full endpoint documentation with request/response shapes.

## Links

- [openLesson Academy](https://www.openlesson.academy)
- [OpenClaw](https://openclaw.ai)
- [ClawHub Listing](https://clawhub.ai/dncolomer/open-lesson)

## License

MIT
