# Serving OpenMock documents — recommended practice

**Status: non-normative.** Document conformance is defined by the
[specification](../spec/v0.2.md) and the [conformance corpus](../conformance)
alone; nothing here affects how a document resolves a request. This page
describes how implementations *around* the resolution engine should behave —
so that the same document lands on the same ports, with the same defaults,
whether it is served by a standalone CLI or inside an application that
embeds OpenMock.

The key words **MUST**, **SHOULD**, and **MAY** are used as in
[RFC 2119](https://www.rfc-editor.org/rfc/rfc2119), scoped as each section
states.

## 0. Roles: engine, host, standalone server

Three roles recur below; most disagreements about "what must an
implementation do" dissolve once they are kept apart:

- **Resolution engine** — the `parse → match → render` core that resolves
  normalized requests against a document. This is the only role the
  specification and corpus constrain. It binds no sockets and has no ports.
- **Embedding host** — an application that consumes the engine as a library
  and owns the transport itself: an API client offering "mock servers" in
  its UI (a Postman-like tool), a test framework spinning mocks up
  in-process, an IDE plugin. The host binds ports, surfaces discovery
  through **its own UI or API**, and is *not* expected to expose the admin
  API of §3.
- **Standalone server** — a runtime whose whole job is serving documents
  (`openmock serve`). It claims the **serving profile**: the port
  resolution of §2 *and* the admin API of §3, which is simply the CLI's
  projection of the engine capabilities below over HTTP.

### Who is bound by what

| Responsibility | Resolution engine | Embedding host | Standalone server |
| -------------- | ----------------- | -------------- | ----------------- |
| Parse, match, render; refuse invalid documents (spec + corpus) | **owns it** | via the engine | via the engine |
| Bind ports; resolve them by §2's order; fail loudly, never silently reassign | — (binds no sockets) | **MUST** | **MUST** |
| Surface the resolved name → port topology (discovery) | — | **MUST**, via its own UI or API | **MUST**, via the admin API (§3) |
| Expose the HTTP admin API on 4400 (§3) | — | not expected | **MUST** |
| Offer reset (clear call counters) | provides the capability | projects it via its own UI or API | projects it via `POST /reset` (§3) |

In words: the **engine** is bound only by the specification — it has no
ports, and nothing in this document adds obligations to it. §1 and §2 are
the **shared** responsibilities, binding *both* serving roles (host and
standalone), because they are what make one document behave identically
everywhere it is served. §3 is **standalone-only**: the admin API is nothing
more than the standalone server's HTTP projection of the shared discovery
and reset capabilities, which an embedding host projects through its own UI
or API instead. Wherever this document says **"the serving profile"**, it
means the standalone server's obligations — §2 *plus* §3.

### Engine capabilities

Whatever the packaging, a serving-capable engine exposes the same four
capabilities; the profile and an embedding host differ only in how they are
projected (HTTP endpoints vs. library calls and UI):

1. **Load & validate** a document (refusing invalid ones whole, per
   [spec §3.6](../spec/v0.2.md#36-document-validity));
2. **Enumerate topology** — the declared servers with their `name`, `type`,
   and `port` hint;
3. **Resolve** a normalized request to a response
   ([spec §8](../spec/v0.2.md#8-matching-algorithm));
4. **Reset state** — clear call counters to start a fresh "run"
   ([spec §6.3](../spec/v0.2.md#63-the-calls-facet-and-the-call-counter)).

A library API should expose all four directly (their shape in each language
is the implementation's business); the admin API of §3 is these same
capabilities over HTTP. Keeping the two aligned is what makes a document —
and the tooling around it — portable between a CLI and a host.

## 1. Serving semantics (all hosts)

*Applies to: **embedding hosts and standalone servers** — any process that
binds ports for a document. Shared responsibility.*

The rules of §2 bind **any** implementation that serves a document over a
network — standalone or embedding — because they are what make one document
behave identically everywhere:

- **Configuration beats hints beats defaults** (§2's order). For a
  standalone server, "configuration" is flags and environment; for an
  embedding host, it is the host's own settings — the port field in a
  Postman-like UI plays exactly the role of the CLI's `--port` flag.
- **Hints are prefills.** A host **SHOULD** surface the document's `port`
  hints as the *default* values in its UI or API, and **MUST NOT** treat
  them as binding when its user configures otherwise.
- **The sole-server default and ephemeral fallback apply unchanged.** A
  host that opens a document with one HTTP server should offer 3000, not a
  random port; a host that must avoid collisions should bind port `0` and
  report what the OS assigned — through its own UI, which is its
  `GET /servers`.
- **No silent reassignment** (§2). If a user-configured or hinted port
  cannot be bound, surface the failure; never quietly serve elsewhere.

What an embedding host is exempt from is exactly one thing: the **HTTP
admin API** (§3). Its discovery and reset surfaces are its own UI and API —
the capabilities must exist, their projection is free.

## 2. Port resolution

*Applies to: **embedding hosts and standalone servers** — shared
responsibility, per §1.*

Every network-served server needs exactly one resolved port, from four
sources, first match wins:

1. **Explicit configuration** — for a standalone server, a CLI flag or
   environment variable (`--port <name>=<n>`, repeatable; or
   `OPENMOCK_PORTS="users-api=3000,billing-api=3001"`); for an embedding
   host, its own settings (§1). Deployment configuration belongs to the
   deployment layer, so explicit configuration always beats the document.
2. **The document's `port` hint** ([spec §3.3](../spec/v0.2.md#33-servers-required)) —
   the author's declared default.
3. **The sole-server default** — when the document declares **exactly one**
   server of a type, that server gets the stable default port for the type.
   This profile recommends: `http` 3000, `graphql` 3001, `websocket` 3002,
   `grpc` 3003 (and 4400 for the admin API, §3). Stable defaults keep the
   everyday single-server loop (`openmock serve mocks.yml`, point a client
   at `:3000`) free of configuration and of surprises across restarts.
4. **Ephemeral fallback** — any server still unresolved binds an
   **OS-assigned ephemeral port** (bind port `0`), reported through the
   discovery surface (a standalone server's admin API, §3; a host's own UI
   or API). Ephemeral beats a made-up random number (the OS guarantees no
   collision) and beats sequential auto-increment (no dependence on
   declaration order, no clash with a neighbour's 3001).

Rules:

- A serving implementation (host or standalone) **MUST NOT** silently
  reassign a port resolved from sources 1–2. If a configured or hinted port
  cannot be bound, it **MUST** fail loudly for that source — never fall
  through to another port — so tests point at what they think they point at.
- An automatically assigned port (rung 4, or any port the implementation
  picks itself) **MUST NOT** be one of the profile's default ports — 3000,
  3001, 3002, 3003, or 4400 — **whether or not** the current document uses
  that default. Example: a document declares two `http` servers and the
  first resolves to 3000; giving the second 3001 is forbidden, because 3001
  is the `graphql` default — a graphql server added to the document later,
  or a neighbouring document on the same machine, expects to find it free.
  The second server binds an OS-ephemeral port instead. Binding port `0`
  satisfies this rule by construction (every mainstream OS's ephemeral
  range lies far above these values) — one more reason the fallback is
  OS-assigned rather than a self-picked "random" number.
- Two servers resolving to the same port is a startup **error**.
- A serving implementation **SHOULD** surface the full name → port mapping
  at startup — a standalone server by logging it; the admin API is the
  machine-readable version of the same truth.

## 3. The admin API

*Applies to: **standalone servers only**. An embedding host satisfies the
same discovery and reset capabilities through its own UI or API (§0, §1)
and is not expected to expose these endpoints.*

A **standalone server MUST** expose an admin endpoint while serving. It is
the discovery mechanism that makes rung 4 of §2 usable and the stable
coordinate that everything else can be found from.

- **Default port: 4400**, overridable with `--admin-port <n>` (and
  `--admin-port 0` for an ephemeral admin port when the caller captures the
  server's output).
- **Default bind: `127.0.0.1`.** The admin surface enumerates topology and
  will grow state-mutating endpoints; it **MUST NOT** listen beyond loopback
  unless explicitly configured (`--bind`, §5, §6).

### `GET /servers`

Returns the served topology as a JSON array, one entry per declared server,
in document order:

```json
[
  { "name": "users-api",   "type": "http", "transport": "http", "port": 51837, "url": "http://127.0.0.1:51837" },
  { "name": "orders-grpc", "type": "grpc", "transport": "grpc", "port": 3003,  "url": null },
  { "name": "orders-mcp",  "type": "mcp",  "transport": null,   "port": null,  "url": null }
]
```

| Field       | Type            | Meaning                                                        |
| ----------- | --------------- | -------------------------------------------------------------- |
| `name`      | string          | The server's `name` from the document.                         |
| `type`      | string          | The server's `type` from the document.                         |
| `transport` | string or null  | How this process serves it; `null` when this process does not bind it (e.g. a stdio-launched type, §4). |
| `port`      | integer or null | The **resolved** port — the runtime truth, including overrides and ephemeral assignments. |
| `url`       | string or null  | A dialable base URL when one exists for the transport.         |

The response reports what *actually* happened, which is precisely what makes
`port` hints safe to treat as hints: the declared intent lives in the file,
the runtime truth lives here. Servers **MAY** add fields; consumers **MUST**
ignore fields they do not know.

### `GET /health`

Returns `200` with `{ "status": "ok" }` once every server is bound and
serving. This is the container healthcheck target (§5).

### Reserved: `POST /reset`

Resets all call counters ([spec §6.3](../spec/v0.2.md#63-the-calls-facet-and-the-call-counter)
leaves the "run" boundary to the implementation — this is the test-framework
reset hook it anticipates). Standalone servers **SHOULD** implement it; its
detailed semantics will be pinned when reference tooling lands.

## 4. stdio transports (future: MCP)

*Applies to: **standalone servers** — the launched subprocess is the
standalone binary.*

Some anticipated server types — an MCP server being the motivating example —
are served over **stdio**, where the client launches the standalone server
as a subprocess. The profile's rule, stated now so the port model and the
future type stay coherent:

> **One stdio session incarnates exactly one server.** The launch selects it:
> `openmock mcp mocks.yml --server orders-mcp`, or, when the document
> declares exactly one server of the launched type, no flag at all — the
> sole-server default again, transposed. Two stdio servers in one document
> mean two subprocess launches against the same file.

The stdio process binds no ports and serves no admin API; attribution is
trivial (everything on the pipe belongs to the launched server), and the
`port` field is meaningless for it — which is why `port` is optional in the
schema. A concurrently network-serving process lists stdio-only servers in
`GET /servers` with `"transport": null`.

## 5. Containers

*Applies to: **standalone servers** — the role that runs in a container.*

Docker already implements "random ports + discovery" at its own boundary
(`docker run -P`, `docker port`, testcontainers' `getMappedPort`).
**Randomness belongs at exactly one layer** — so inside a container, be
deterministic:

- **Single-server documents need nothing**: the sole-server default (rung 3)
  is already deterministic. `EXPOSE 3000`, publish it, done.
- **Multi-server documents**: give every server you want reachable a
  deterministic container port — `port` hints in the file, or flags/env in
  the compose file, which is the *right* home for deployment configuration:

  ```yaml
  services:
    mocks:
      image: openmock
      command: ["serve", "mocks.yml", "--bind", "0.0.0.0"]
      environment:
        OPENMOCK_PORTS: "users-api=3000,billing-api=3001"
      ports: ["3000:3000", "3001:3001", "4400:4400"]
      healthcheck:
        test: ["CMD", "curl", "-f", "http://localhost:4400/health"]
  ```

- A server left on an ephemeral port inside a container is **unreachable
  from outside** (Docker can only publish ports it knows ahead of time).
  That is self-consistent, but the server **SHOULD** warn when it detects
  it is likely containerized and assigns an ephemeral port.
- **Bind addresses**: the loopback defaults that are right on a laptop make
  a containerized server unreachable. A standalone server **MUST** provide
  `--bind` (mock servers and admin alike), and an official container image
  **SHOULD** default it to `0.0.0.0`.
- **Two-step discovery**: `GET /servers` answers "which container port is
  `billing-api`?" — the half Docker cannot tell you; `docker port` /
  `getMappedPort` answers "which host port is container port 3001?". A
  testcontainers-style harness composes the two.

## 6. Security

*Applies to: **all roles** — anything that binds a socket or handles a
document.*

- Loopback binding is the default for everything (§2, §3); exposing beyond
  it is an explicit choice.
- The admin API discloses topology and will mutate state (`/reset`); treat
  it like any other admin surface — never expose it on the same interface
  as the mocks in a shared environment without access control in front.
- The document-level security considerations of
  [spec §14](../spec/v0.2.md#14-security-considerations) apply unchanged;
  `port` names no files and adds no new document-level surface.
