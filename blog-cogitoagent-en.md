# CogitoAgent: An Open-Source, Local-First AI Agent That Thinks Continuously and Runs 200+ Tools

> *Think continuously. Act autonomously. Stay private.*

Most AI agents today fall into one of two camps: they either upload your files to a third-party cloud, or they sit idle until you type another prompt. **CogitoAgent** is an open-source project that takes a different stance — your files stay on your machine, and the agent keeps thinking on its own.

In this post, I'll walk through what CogitoAgent is, how it's architected, and why you might want to give it a star.

- **GitHub:** https://github.com/SnowLeopard-io/CogitoAgent
- **Gitee (China mirror):** https://gitee.com/cnt-code/cogito-agent
- **License:** Apache 2.0
- **Stack:** TypeScript 5.x · Node.js ≥ 22.12 · Electron · isolated-vm
- **Current version:** v2.3.2

---

## What Is CogitoAgent?

CogitoAgent is an open-source autonomous agent framework that runs **directly inside your local workspace**. It calls the LLM API of your choice (any OpenAI-compatible endpoint, BYO key) to drive reasoning and decisions, while **your files, code, git repos, and databases never leave your machine**.

The key phrase is **"cloud-driven, local-executed."** It is *not* a fully offline local LLM (that's on the roadmap). Instead, only the conversation context is sent to your specified LLM API — file I/O, code execution, git operations, and database queries all happen locally.

If you've used AutoGPT, Claude Code, or Cline, here's how CogitoAgent positions itself:

| Capability | CogitoAgent | AutoGPT | Claude Code | Cline |
| --- | :---: | :---: | :---: | :---: |
| Files stay local | ✅ | ❌ | ❌ | ⚠️ |
| Continuous thinking (auto-cycle) | ✅ 3s | ❌ | ❌ | ❌ |
| Desktop GUI (Electron) | ✅ | ❌ | ❌ | ❌ |
| MCP support | ✅ Server | ❌ | ✅ Client | ✅ Client |
| Plugin system | ✅ Dynamic | ✅ | ❌ | ❌ |
| Multi-agent cluster | ✅ | ❌ | ❌ | ❌ |
| Code sandbox (isolated-vm) | ✅ | ❌ | ❌ | ❌ |
| 200+ built-in tools | ✅ | ❌ | ❌ | ❌ |
| Open source | ✅ Apache 2.0 | ✅ MIT | ❌ | ✅ Apache 2.0 |

---

## Core Features at a Glance

1. **TypeScript core** — Full TypeScript rewrite with compile-time type safety.
2. **Privacy first** — Workspace files stay local; only conversation context is sent to your LLM API.
3. **Continuous thinking** — `thinkCycle()` auto-triggers every 3 seconds (configurable).
4. **Tool execution** — 28 tool modules, 200+ tools, covering file ops, code, git, databases, OCR, Office, GIS, bioinformatics, medicine, chemistry, finance, and more.
5. **Security sandbox** — JavaScript runs in `isolated-vm` for process-level isolation; Python via subprocess.
6. **Multi-session management** — Independent sessions with persistent storage and auto-compression (150 turns / 100k tokens).
7. **Desktop mode** — Electron windows communicate with the terminal agent via WebSocket (port 9527).
8. **MCP protocol** — Exposes all tools as an MCP Server (JSON-RPC 2.0 on port 3001) for integration with other AI clients.
9. **Plugin system** — Dynamically load custom tool plugins.
10. **Thought chain visualization** — Real-time visualization of the reasoning process and tool executions.
11. **Agent cluster** — Sub-agent spawning, task delegation, and multi-agent collaboration.
12. **WeChat integration** — QR login, message send/receive, dedicated session (via iLink protocol, optional).

---

## Architecture: Think Loop + State Machine + Registry

The cleanest way to understand CogitoAgent is through three core components.

### 1. The Think Loop (`Agent.ts`)

This is what makes the agent "think on its own." A reasoning cycle fires every 3 seconds (configurable):

```
thinkCycle() fires
   ↓
streamChat()  →  SSE stream to LLM API
   ↓
tool-parser.ts parses [TOOL] fn(args) [/TOOL]
   ↓
executeTool()  →  registry lookup, run tool
   ↓
scheduleNextCycle()  →  loop control
```

Tool calls are expressed via a custom `[TOOL] functionName(args) [/TOOL]` tag format, parsed by `tool-parser.ts`. The advantage of this approach over native function calling: **it's model-agnostic** — any model that can emit text can drive tools, which is why CogitoAgent works with GPT, Claude, or any OpenAI-compatible provider.

### 2. The State Machine (`state.ts`)

The agent cycles through three states:

- `AWAITING_INPUT` — waiting for user input
- `THINKING` — currently reasoning
- `AWAITING_CONFIRMATION` — waiting for user approval (for dangerous ops)

The `AWAITING_CONFIRMATION` state pairs with a `DANGEROUS_OPERATIONS` mechanism — destructive actions (file deletion, `git push`, etc.) require explicit user confirmation before executing. This is how CogitoAgent balances autonomy with safety.

### 3. The Tool Registry (`registry.ts`)

All tools are registered in a single `TOOL_REGISTRY`, queried by `executeTool()`. Centralizing this gives you:

- **Observability via stats** — `stats.ts` tracks tool call counts and success rates per category.
- **Tracing** — `tracing.ts` logs tool execution events with durations.
- **Unified extensibility** — plugins (`plugin.ts`) and MCP (`mcp.ts`) both inject into the same registry; the main loop is unaware of the source.

---

## The Tool System: 200+ Tools Across 28 Modules

This is the thickest part of the project. A sample of the modules:

| Category | File | Representative Tools |
| --- | --- | --- |
| File ops | `file.ts` | ls / read / write / copy / move / rename / delete |
| Browser automation | `browser.ts` | initBrowser / clickElement / fillField / takeScreenshot / searchOnEngine / downloadFile |
| Code execution | `code.ts` | executeCode / runJavaScript / runPython / formatCode |
| Security sandbox | `sandbox.ts` | createJavaScriptSandbox / runJavaScriptSandbox / runPythonSandbox |
| Git | `git.ts` | gitInit / gitClone / gitCommit / gitPush / gitBranchCreate / gitMerge / gitDiff |
| Task management | `task.ts` | createTask / splitTask / updateTask / getTaskStats |
| Memory | `memory.ts` | addMemory / searchMemory / getRelatedMemories (tag-based semantic retrieval) |
| Data processing | `data.ts` | readCSV / writeJSON / csvToJSON / queryData / aggregateData |
| Database | `db.ts` | executeSQL / createTable / executeTransaction (via sql.js) |
| Email | `email.ts` | sendEmail / sendHtmlEmail / sendEmailWithAttachments |
| System monitoring | `monitor.ts` | getCPUInfo / getMemoryInfo / getProcesses / monitorSystem |
| Scheduler | `scheduler.ts` | addScheduleTask / toggleScheduleTask / startScheduler |
| Office docs | `office.ts` | createPpt / createWord / createExcel / readExcel |
| Vision | `ocr.ts` / `vision.ts` | ocr / ocrBatch / vision / visionFromUrl |
| Cluster | `cluster.ts` | spawnAgent / delegateTask / parallelExecute / pipeline / voting / panelDiscussion |
| GIS | `gis.ts` | convertCoord / calcDistance / calcArea / readGeoJSON / geoJSONToKML |
| Bioinformatics | `bio.ts` | dnaComplement / gcContent / tmEstimate / parseFASTA / codonUsage |
| Medicine | `med.ts` | bmi / bsa / egfr / crcl / calculateDose / vitalsReport |
| Chemistry | `chem.ts` | molWeight / molarity / dilution / phFromH / idealGasLaw |
| Finance | `finance.ts` | npv / irr / roi / loanPayment / amortizationSchedule / volatility |
| Math / stats | `math.ts` | describe / correlation / linearRegression / matrixInverse / factorial |

**The takeaway:** CogitoAgent isn't just a "coding agent." It bundles scientific computing (bioinformatics, molecular weight, medical formulas), geospatial processing, financial calculations, document generation, browser automation, and more into a single registry. For researchers, analysts, and office-automation tinkerers, this breadth often matters more than raw code generation.

### Extending the tool set

- **Plugin system** (`plugin.ts`) — dynamically load custom tool plugins. The repo ships three example plugins under `plugins/`: `biopython-bio`, `pubmed-research`, and `rdkit-chem` (bioinformatics / literature search / cheminformatics).
- **MCP protocol** (`mcp.ts`) — expose all 200+ tools as an MCP Server, so any MCP-compatible AI client can reuse CogitoAgent's tool ecosystem.

---

## Multi-Agent Cluster: From "One Helper" to "A Team"

One of the most interesting features. Via `orchestrator.ts` and `cluster.ts`, the main agent can:

- **`/spawn <persona> <name> <instruction>`** — create a sub-agent with a given persona
- **`/delegate <agentId> <task>`** — delegate a task to a sub-agent
- **`parallelExecute`** — run sub-agents in parallel
- **`pipeline`** — chain sub-agents in a sequential pipeline
- **`voting` / `panelDiscussion`** — voting or round-table decision patterns

Sub-agent state transitions are standardized:

```
idle → thinking → tool_executing → thinking → ... → done
  ↓                                                    ↓
  └────────────────── error ←──────────────────────────┘
```

A dedicated **monitor panel** (a separate Electron window, 16:9 layout) provides three real-time visualizations:

1. **Thought Chain** — live reasoning steps with parameters, status, and duration.
2. **Tool Statistics** — an ECharts bar chart of call counts and success rates per category; color intensity encodes success rate.
3. **Cluster Topology** — a Canvas-rendered ring topology with the main agent at the center and sub-agents around it; active nodes pulse.

This means you can not only delegate work — you can *watch the agents work*, which is genuinely useful for debugging multi-agent behavior and studying agent observability.

---

## Persona System: Programmers, Doctors, Knights-Errant...

CogitoAgent ships with 20+ preset personas in the `personas/` directory, split into two families:

- **Modern professional roles** — Programmer, Doctor, Biologist, Chemist, Computational-Scientist, Scholar, Detective, Psychologist, Teacher, Chef, Painter, Strategist, Merchant...
- **Historical / regional roles** — Knight-Errant, Imperial-Critic, Scholar-Official, Mongolian-Youth, Shaanbei-Youth, Tibetan-Youth, Warrior, Shadow-Guard, Hermit...

Personas load via `system-prompt.ts` and can be hot-swapped with `/persona <name>`. Each persona has its own `persona.md` file; some include portrait images.

Combined with the cluster feature, this lets you **spawn a Scholar sub-agent for literature review, a Programmer sub-agent to write code, and a Critic sub-agent to review it** — different "personalities" each owning a slice of the task.

---

## Three Usage Modes

| Command | Mode | Best for |
| --- | --- | --- |
| `npm start` | Setup wizard | First-time config or modifying settings (API URL, key, model, workspace, persona) |
| `npm run electron:desktop` | Desktop mode | Electron overlay window + terminal agent, daily desktop use |
| `npm run electron:dashboard` | Dashboard mode | Full-screen dashboard with session management, tool viz, and monitor panel |
| `npm run cli` | CLI mode | Pure terminal, no Electron — servers / headless / CI |

---

## Quick Start

**Requirements:** Node.js ≥ 22.12, npm or yarn, Python 3.x (optional, for Python code execution).

```bash
git clone https://github.com/SnowLeopard-io/CogitoAgent.git
cd CogitoAgent
npm install
npm start
```

First launch asks for five things:

1. **API base URL** — any OpenAI-compatible endpoint
2. **API key** — your key
3. **Model name** — e.g. `gpt-4o`, `claude-3-sonnet`
4. **Workspace path** — the directory the agent can access (use a dedicated folder, not your home dir)
5. **Persona** — pick a preset role

Docker one-liner also works:

```bash
docker-compose up -d
```

> **Note for users in China:** if `npm install` fails to fetch the Electron binary, set `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` before installing. A Gitee mirror is also available for faster cloning: https://gitee.com/cnt-code/cogito-agent

### Handy commands

| Command | What it does |
| --- | --- |
| `/sessions` `/new` `/switch <id>` | multi-session management |
| `/persona <name>` `/personas` | switch / list personas |
| `/tools` | list all available tools |
| `/status` `/config` | show status / config |
| `/spawn` `/agents` `/delegate` | multi-agent cluster |
| `ENTER` | interrupt thinking, enter input mode |

> **Safety tip:** always scope the "workspace path" to a dedicated folder. When the agent attempts a destructive op, it enters `AWAITING_CONFIRMATION` — review carefully before approving.

---

## Who Is This For?

- **Researchers / data analysts** — bio, chem, med, GIS, and finance tools out of the box; let the agent run sequence analysis, compute molecular weights, or do financial calculations directly.
- **Office automation enthusiasts** — Office docs, email, scheduler, browser automation in one place.
- **AI agent developers / researchers** — a fairly complete open-source reference for multi-agent collaboration, agent observability, and the MCP protocol.
- **Privacy-conscious developers** — if you don't want your code and files uploaded to a cloud, and you're fine bringing your own LLM key.
- **WeChat bot / private-domain automation tinkerers** — iLink protocol + 200+ tools is a powerful playground (evaluate ToS risk yourself).

---

## Roadmap Highlights

Recent releases:

- **v2.3.2** (2025-07) — full TypeScript migration; 6 new professional modules (GIS, Bio, Med, Chem, Finance, Math); CI/CD pipelines.
- **v2.3.1** — WeChat iLink protocol integration with QR login and messaging.
- **v2.3.0** — multi-session, sandbox upgrade, MCP protocol, plugin system, OCR/vision, thought-chain visualization.

What's coming next:

- **Local LLM support** (Ollama / LM Studio — no API key needed)
- **VS Code extension** and **MCP Client mode** (connect to external MCP servers)
- **Long-term memory** via local vector DB, and **scheduled autonomous tasks**
- Long-term: mobile companion app, plugin marketplace, enterprise features (RBAC, audit, SSO)

---

## Honest Limitations

To keep this honest:

1. **Not fully offline** — it still calls a cloud LLM API. True local inference is on the roadmap but not shipped yet.
2. **Not beginner-friendly** — you need an API key, Node.js, and basic terminal literacy.
3. **Continuous thinking = continuous token spend** — the 3s loop is a no-op when idle, but pair it with task management to avoid burning tokens on nothing.
4. **WeChat automation carries ToS risk** — use with personal accounts and at your own risk.
5. **Breadth over depth** — 200+ tools cover a lot of ground, but some domain tools (bio, chem) are suited for lightweight calculations, not heavy-duty workloads.

---

## Community & Contributing

CogitoAgent is Apache 2.0 and actively welcomes community contributions:

- ⭐ **Star the repo:** https://github.com/SnowLeopard-io/CogitoAgent
- 🐛 **Report bugs / request features:** https://github.com/SnowLeopard-io/CogitoAgent/issues
- 💬 **Join discussions:** https://github.com/SnowLeopard-io/CogitoAgent/discussions
- 🌱 **Good First Issues:** https://github.com/SnowLeopard-io/CogitoAgent/issues?q=is%3Aopen+is%3Aissue+label%3A%22good+first+issue%22

The repo ships with 10 labeled beginner-friendly tasks under `.github/good-first-issues/` (e.g. "add unit tests for finance/math tools," "add JSDoc to tool functions," "add YAML processing tools," "add timezone/date utility tools"). Perfect for a first open-source PR.

---

## Final Thoughts

CogitoAgent's slogan — *"Think continuously. Act autonomously. Stay private."* — borrows from Descartes' *Cogito, ergo sum*. In a market flooded with AI agents, it picks a less flashy but solid path: **keep execution local, make tools thick, build multi-agent for real, and keep the protocol open.**

If you're looking for an agent framework that lives on your machine, thinks on its own, calls a pile of tools, and doesn't ship your files to the cloud — give it a try, star the repo, or pick a Good First Issue. The next version might just include your code.

**Links:**

- GitHub: https://github.com/SnowLeopard-io/CogitoAgent
- Gitee (China mirror): https://gitee.com/cnt-code/cogito-agent
- Good First Issues: https://github.com/SnowLeopard-io/CogitoAgent/issues?q=is%3Aopen+is%3Aissue+label%3A%22good+first+issue%22
- Discussions: https://github.com/SnowLeopard-io/CogitoAgent/discussions

---

*If you found this useful, consider sharing it with someone who'd like a local-first AI agent. Comments and feedback are welcome — I read every one.*
