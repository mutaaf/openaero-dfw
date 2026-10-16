# OpenAero DFW

A 6-DOF flight simulator in the browser, flown over real satellite imagery of the
Dallas-Fort Worth metroplex. Land a 737 on DFW 35C, take an F-16 past Reunion Tower, or
shoot the approach into Love Field in a Cessna. No install, no account.

**Play:** https://mutaafaziz.com/openaero/

## Built and run by agents

This repo is developed by three scheduled cloud agents (Claude Code routines), with CI as
the gate and Cloudflare deploying `main` on every merge:

| Agent | What it does |
|---|---|
| **Scout** | Plays the current build, researches real-world references, grooms `docs/backlog/` |
| **Builder** | Ships the top ready ticket test-first, merges on green CI, verifies production |
| **Keeper** | Dependencies, performance budget, refactoring, tuning the agents' own prompts |

Their instructions are versioned in [`agents/prompts/`](agents/prompts/). The operating
manual for agents and humans alike is [`AGENTS.md`](AGENTS.md). What shipped is in
[`docs/CHANGELOG.md`](docs/CHANGELOG.md); what's next is in [`docs/backlog/`](docs/backlog/).

### Controlling the agents

- **Pause / steer:** edit [`agents/control.json`](agents/control.json) (GitHub web or
  mobile is fine). `"paused": true` stops all three; per-agent `enabled`, a free-text
  `focus` that outranks the agents' own ideas, and caps like `max_merges_per_day`.
- **Frequency:** each agent's schedule lives at https://claude.ai/code/routines.
- **Rollback:** revert the PR on GitHub; Cloudflare redeploys `main`.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173/openaero/
npm run check    # the gate CI runs: backlog validator, unit tests, build, e2e
```

Controls: W/S pitch, A/D roll, Q/E rudder, Shift/Ctrl throttle, G gear, F flaps,
B brakes, C camera, Z autopilot, M mouse-yoke.

Satellite imagery © Esri, Maxar, Earthstar Geographics. Built with three.js and Vite.
