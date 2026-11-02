# pi-pstack

A Pi-native port of [pstack](https://github.com/cursor/plugins/tree/main/pstack). It includes all 44 upstream skills and their references, playbooks, and scripts, plus Pi implementations of `poteto-agent` and `comment-sicko`.

## Install

Install the published package:

```bash
pi install git:github.com/kkgogogo17/pi-pstack@v0.1.0
```

Then restart Pi. Use `pi config` to enable or disable package resources.

## Start

```text
/setup-pstack
/poteto-mode investigate and fix the retry regression, then verify it
/poteto-mode off
```

`/setup-pstack` is an extension command. It interactively maps pstack roles to models that Pi has configured and saves the result in `~/.pi/agent/pstack/models.json`.

`/poteto-mode` enables sticky Poteto Mode for the current Pi session and expands the bundled `poteto-mode` skill. `/poteto-mode off` disables it. Individual skills use Pi's standard form, for example `/skill:how` and `/skill:no-comments`.

## Pi subagents

The extension registers a `subagent` tool using Pi's official isolated-process pattern. A child runs as a separate `pi --mode json --print --no-session` process and returns only its final result to the parent context.

Bundled agents:

- `poteto-agent` for pstack implementation and investigation delegates. It must read the full `poteto-mode` skill before working.
- `comment-sicko` for comment-only review.

The tool supports a single task, `tasks` for parallel work, and `chain` for sequential work with `{previous}` interpolation. It accepts `role` for the model configuration and `model` for a one-off `provider/model` override. It permits at most eight tasks and runs at most four concurrently.

It also honors Pi's subagent definition locations:

- `~/.pi/agent/agents/*.md` for user agents.
- `.pi/agents/*.md` for project agents, only with `agentScope: "project"` or `"both"`.

Bundled agents are the default. Project agents require interactive approval unless `confirmProjectAgents: false` is explicit.

## Safety and compatibility

This port deliberately removes Cursor-only setup and behavior:

| Cursor pstack behavior | Pi equivalent |
|---|---|
| `Task` and `subagent_type` | `subagent` tool and Markdown agent definitions |
| Cursor model slugs and rules | `/setup-pstack`, `pstack_config`, and Pi `provider/model` selectors |
| sticky `mode: true` | session-persisted `/poteto-mode` extension command |
| Cursor todo list | `pstack_todo` tool |
| Cursor transcript directories | `$PI_SESSION_FILE` and `pstack_sessions` |
| `/loop`, cloud-agent resume | explicit project watchers; child Pi processes are local and fresh |
| Cursor Team Kit skills | capability detection and project-native verification tooling |

The extension requests confirmation for recognizable shell commands that push, alter pull requests, merge, deploy, mutate infrastructure, or recursively delete files. In non-interactive mode it blocks these commands. This is a guardrail, not a complete shell-security sandbox. Prompts also require explicit approval for all external or irreversible actions.

### Confirmation gate

This fork adds a flag for that gate. It has three modes:

| Mode | What prompts |
|---|---|
| `strict` *(default)* | Every pattern above, exactly as upstream. |
| `external` | Only actions that leave the machine or mutate shared state: `git push`, `gh pr`, `gt`, terraform/tofu, kubectl, `vercel`/`flyctl`/`railway`. Local `rm -r*` no longer prompts. |
| `off` | Nothing, including non-interactive child processes (which `strict` and `external` block rather than prompt). |

Set it three ways, in precedence order:

1. **One run:** `PI_PSTACK_CONFIRM=off pi` — also `strict` / `external`, plus the shorthand `0`/`false`/`none` and `1`/`true`. An unparseable value keeps the configured mode rather than silently dropping the gate.
2. **This install:** `~/.pi/agent/pstack/config.json`:

   ```json
   { "confirm": { "mode": "external", "remember": "session" } }
   ```

3. **Right now:** `/pstack-confirm` reports the effective mode and where it came from; `/pstack-confirm off`, `/pstack-confirm external strict`, and `/pstack-confirm remember off` change and persist it.

```console
$ /pstack-confirm
pstack confirm: external (config.json) · 6 patterns · remember=session · session grants: none
```

`remember` controls how often you are asked:

- `session` *(default)* — the prompt is a three-way choice: **Allow once**, **Always allow this session**, **Deny**. Approving “always” adds the operation (for example `git push`) to an in-memory set that clears when the session ends, so a repeated command stops interrupting you without disabling the gate.
- `off` — upstream behaviour: a yes/no dialog showing the full command, every time.

When the mode is not `strict`, the footer shows `pstack: confirm off` or `pstack: confirm external` so a narrowed gate is never silent.

The gate is deliberately unreachable from model-facing surfaces: neither the `pstack_config` tool nor `/setup-pstack` reads or writes `config.json`. A tool must not be able to lower the guard on its own actions.

The upstream `watch-pr` and orchestration helper scripts are retained. Their runtime requirements remain project-specific. In particular, the script package uses Bun and GitHub workflows require `gh` authentication.

## License and provenance

Derived from Cursor's pstack, licensed under MIT. See [LICENSE](LICENSE).
