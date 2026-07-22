# OpenMock Specification

**Version:** 0.2 (draft) · **Schema version key:** `openmock: 0.2.0`
**License:** MIT · **Home:** https://openmock.dev

---

## 1. Status and scope

OpenMock is an open, self-contained format for describing **API mocks** in a
single YAML file. A single file declares a list of named **servers** — each of
one protocol, each carrying its own operations — and for each operation an
ordered list of scenarios that map an incoming request to a response.

This document is a **draft**. It is precise enough to implement and is backed by
a conformance corpus (see [§12](#12-conformance)), but the format may still
change before a stable 1.0 milestone.

**In scope.** How to write a mock: file structure, request matching, response
shaping, delays, and templating.

**Out of scope.** OpenMock describes *mocks, not running processes*. It is
transport-agnostic: TLS, process management, and hosting are implementation
concerns, as is how an implementation listens for requests and maps a real
request onto the normalized request model used here. The one
deployment-adjacent field a server may carry is the optional `port` **hint**
([§3.3](#33-servers-required)) — a non-binding default for serving
implementations that never changes what a document means. Recommended
practice for the implementations around this specification — standalone
servers (port resolution, a discovery/admin API) and applications embedding
an engine as a library — lives outside it in
[`docs/serving.md`](../docs/serving.md).

**Non-goals.** Some capabilities are deliberately *not* part of the format —
not oversights, and distinct from the *future* protocol work named below.
Each has an OpenMock-native alternative or is simply outside the mission:

- **No proxying or fallthrough.** An unmatched or unrouted request yields a
  synthetic response ([§10](#10-error-and-fallback-responses)); OpenMock
  never forwards to a real backend.
- **No request-verification or call-count assertions.** The `calls` facet
  ([§6.3](#63-the-calls-facet-and-the-call-counter)) *drives responses*; the
  format is not a test-spy API for asserting that a call happened N times.
- **No webhooks or server-initiated calls.** A mock answers requests; it
  does not originate outbound calls. (Server-initiated WebSocket messages
  are *future* work, not a non-goal — see Protocol scope below.)
- **No response randomness or scripting.** A resolved response is a pure
  function of the request and the `calls` counter — no random selection
  among responses, no embedded logic. (`faker` ([§9.3](#93-faker)) produces
  field-level fake data, not control flow.)
- **No cross-request state beyond `calls`.** The per-operation call counter
  is the only stateful primitive; there is no general session store or data
  that mutates across requests.

An implementation **MAY** offer any of these through extensions
([§11](#11-specification-extensions)), but they are outside the portable
format and the conformance corpus.

**Self-contained.** An OpenMock document is serveable on its own: no other
specification or file format is ever required. gRPC messages are written in
the proto3 JSON mapping ([§4.2](#42-grpc-requests)), and a document MAY attach
a compiled protobuf schema ([§3.4](#34-grpc-servers-descriptorset)) — but never has to.
Likewise, GraphQL mocks are serveable without a GraphQL schema; a document MAY
attach one ([§3.5](#35-graphql-servers-schema)) — but never has to.

**Protocol scope.** v0.2 addresses **HTTP/REST**, **gRPC** (unary and
server-streaming calls), **GraphQL** (queries and mutations), and
**WebSocket** (client-initiated request/reply exchanges) mocks. The protocols
share one model — named servers, operations, first-match-wins scenarios,
`when` facets, `calls`, delays, templating, and extensions — and differ only
in three places, summarized here and detailed in the sections referenced:

| Protocol    | Addressed by ([§5](#5-operations)) | Matchable `when` facets ([§6.1](#61-when)) | Response fields ([§7](#7-the-response-object)) |
| ----------- | ---------------------------------- | ------------------------------------------ | ---------------------------------------------- |
| `http`      | `method` + `path`                  | `params`, `query`, `headers`, `body`       | `status`, `headers`, `body`                    |
| `grpc`      | `service` + `rpc`                  | `metadata`, `message`                      | `status`, `error`, `metadata`, `trailers`, `message`/`messages` |
| `graphql`   | `operationType` + `operationName`  | `variables`, `headers`                     | `data`, `errors`, `extensions`                 |
| `websocket` | `path`                             | `params`, `query`, `headers`, `message`    | `messages`, `close`                            |

The `calls` facet ([§6.3](#63-the-calls-facet-and-the-call-counter)) is
matchable under every protocol. Client-streaming and bidirectional gRPC
calls, GraphQL subscriptions, and server-initiated WebSocket messages
(greetings on connect, unsolicited pushes) are expected in future versions by
the same reuse principle.

## 2. Conventions

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHOULD**, **SHOULD NOT**,
and **MAY** in this document are to be interpreted as described in
[RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

A **document** is one OpenMock YAML file. Unless stated otherwise, "the string
value" means a YAML scalar rendered as text. Object key order is not
significant except where explicitly noted (scenario order **is** significant).

## 3. File structure

An OpenMock document is a YAML mapping with these top-level fields:

```yaml
openmock: 0.2.0        # REQUIRED — spec version this document targets
info:                  # OPTIONAL — human-oriented metadata
  title: Shop mocks
  version: 1.0.0
  description: Mock responses for the shop's services.
servers:               # REQUIRED — the mock servers (at least one)
  - name: users-api            # REQUIRED — unique across the list
    type: http                 # REQUIRED — http | grpc | graphql | websocket
    operations:                # REQUIRED — at least one operation
      - method: GET
        path: /users/{id}
        scenarios:
          - name: found
            response:
              status: 200
              body:
                id: "{{params.id}}"
                name: Ada Lovelace
  - name: orders-grpc
    type: grpc
    descriptorSet: ./shop.binpb   # protocol settings live on the server (§3.4)
    operations:
      - service: shop.v1.OrderService
        rpc: GetOrder
        type: unary
        scenarios:
          - name: found
            response:
              status: OK
              message:
                id: "{{request.message.orderId}}"
                state: SHIPPED
```

### 3.1 `openmock` (REQUIRED)

The format version the document targets, as a
[SemVer](https://semver.org/) string. For this specification the value is
`0.2.0`. An implementation **MUST** reject a document whose version it does not
support. While the format is in its `0.x` series it has no stable public
contract in SemVer's sense, so a **minor** increment (`0.1` → `0.2`) may make
breaking changes; an implementation supports specific `0.MINOR` versions and
rejects the rest.

> **Note on numbering.** The format version in the `openmock` key (`0.2.0`) and
> this document's "v0.2 (draft)" label share a `0.2` line — both say the
> format is pre-stable. The key names the on-disk contract that tooling reads;
> until a `1.0.0` milestone the format may still change in `0.x` releases.
> The `0.1` → `0.2` change is itself the breaking-minor rule in action: 0.2
> replaces the flat `operations` list with the `servers` list ([§3.3](#33-servers-required)).

### 3.2 `info` (OPTIONAL)

Human-oriented metadata. All fields are optional and non-normative — they do not
affect matching or responses.

| Field         | Type   | Description                          |
| ------------- | ------ | ------------------------------------ |
| `title`       | string | Display name for the mock set.       |
| `version`     | string | Version of *this mock set* (not the spec). |
| `description` | string | Free-form description.               |

### 3.3 `servers` (REQUIRED)

A non-empty list of **server objects**. A server is a named group of
operations of one protocol — one mock service. A document may declare several
servers, **including several of the same type**: two HTTP services with
overlapping paths coexist in one document because every request addresses a
server by name ([§4](#4-the-request-model), [§8](#8-matching-algorithm)).

| Field        | Type   | Required | Description                                          |
| ------------ | ------ | -------- | ---------------------------------------------------- |
| `name`       | string | yes      | The server's name — how normalized requests address it. Non-empty; **MUST** be unique across the `servers` list. Compared case-sensitively. |
| `type`       | string | yes      | The server's protocol: `http`, `grpc`, `graphql`, or `websocket`. Determines the shape of the server's operations ([§5](#5-operations)), the facets its scenarios may use ([§6.1](#61-when)), and the shape of their responses ([§7](#7-the-response-object)). |
| `port`       | integer | no      | Optional **default port hint** (1–65535) for implementations serving this server over a network. A hint only: engines **MAY** override it, and it never affects routing, matching, or rendering. See the recommended serving practice in [`docs/serving.md`](../docs/serving.md). |
| `operations` | list   | yes      | Ordered, non-empty list of [operation objects](#5-operations) of the server's type. |

Two server types carry one additional, optional field each: `descriptorSet`
on `grpc` servers ([§3.4](#34-grpc-servers-descriptorset)) and `schema` on
`graphql` servers ([§3.5](#35-graphql-servers-schema)).

Rules:

- **At least one server.** A document with no `servers` entry mocks nothing
  and is invalid ([§3.6](#36-document-validity)).
- **Every server carries operations.** A declared server without a non-empty
  `operations` list — even one that attaches a `descriptorSet` — is invalid.
- **Names are unique.** Two servers sharing a `name` make the document
  invalid. This is a load-time semantic rule (a JSON Schema cannot compare
  values across list items), like an inverted `calls` range.
- **Unknown types are rejected.** A `type` outside the four above makes the
  document invalid; future protocols (an MCP server, say) arrive as new
  `type` values in future spec versions, never as silently-ignored entries.
- **Order carries no meaning across servers.** The significant order is the
  order of each server's `operations` list ([§5.3](#53-route-resolution));
  requests are routed by server name, never by position.
- **`port` is a hint, not behaviour.** It follows the same contract as
  `descriptorSet` and `schema` ([§3.4](#34-grpc-servers-descriptorset),
  [§3.5](#35-graphql-servers-schema)): matching, templating, and response
  resolution against the normalized request model are identical with the
  field present, absent, ignored, or consumed. The conformance corpus
  ([§12](#12-conformance)) holds engines to this.
- A top-level `operations` key is the **0.1 layout** and is invalid in 0.2.
  An implementation **SHOULD** name the `servers` layout in its diagnostic
  when it sees one — it is the migration mistake every 0.1 author will make
  once.

### 3.4 gRPC servers: `descriptorSet`

A server of `type: grpc` **MAY** carry one additional field:

| Field           | Type   | Required | Description                                                                 |
| --------------- | ------ | -------- | --------------------------------------------------------------------------- |
| `descriptorSet` | string | no       | Path, resolved relative to the document (see [§14](#14-security-considerations) on untrusted paths), to a serialized `google.protobuf.FileDescriptorSet` covering the services this server mocks. |

A **descriptor set** is the protobuf ecosystem's standard compiled-schema
artifact — the output of `protoc --include_imports --descriptor_set_out=…` or
`buf build -o …` — consumable by every protobuf runtime without parsing
`.proto` source. It **SHOULD** contain every service and message type used by
the server's operations, with transitive imports included. Each gRPC server
carries its own schema: two gRPC servers in one document may attach two
different descriptor sets.

`descriptorSet` exists for **interoperability**: it is the one portable place a
server attaches its protobuf schema. Its rules:

1. It never changes what a document means. Messages in the document remain
   plain data under the proto3 JSON mapping ([§4.2](#42-grpc-requests)), and
   matching, templating, and response resolution against the normalized
   request model are identical with the field present, absent, ignored, or
   consumed. The conformance corpus ([§12](#12-conformance)) holds engines to
   this.
2. An implementation **MAY** ignore it. Every document **MUST** remain
   serveable from its YAML alone, exactly as if the field were absent.
3. An implementation that binds messages to real protobuf encoding — serving
   binary wire format, gRPC server reflection, or schema validation — **MUST**
   accept the schema through this field. It **MAY** additionally offer its own
   mechanisms (flags, registries, extensions), but a document that carries
   `descriptorSet` **MUST NOT** need any of them.
4. A missing or unreadable descriptor set is **not** a document error. The
   implementation **SHOULD** report a diagnostic and **MUST** still resolve
   normalized requests exactly as without the field; only the capabilities the
   descriptor would have enabled are lost.
5. With a descriptor set in hand, an implementation **SHOULD** surface a
   diagnostic when a document's messages contradict the schema (an unknown
   field, a misspelled enum name). The corpus only contains documents whose
   messages agree with their descriptor sets, so both strict and lenient
   engines conform.

### 3.5 GraphQL servers: `schema`

A server of `type: graphql` **MAY** carry one additional field:

| Field    | Type   | Required | Description                                                                 |
| -------- | ------ | -------- | --------------------------------------------------------------------------- |
| `schema` | string | no       | Path, resolved relative to the document (see [§14](#14-security-considerations) on untrusted paths), to a GraphQL schema in SDL (type system definition language) covering the operations this server mocks. |

`schema` is the GraphQL analog of the gRPC server's `descriptorSet` and
follows the same interoperability rules, restated here for GraphQL:

1. It never changes what a document means. `data`, `errors`, and `variables`
   in the document remain plain data, and matching, templating, and response
   resolution against the normalized request model are identical with the
   field present, absent, ignored, or consumed. The conformance corpus
   ([§12](#12-conformance)) holds engines to this.
2. An implementation **MAY** ignore it. Every document **MUST** remain
   serveable from its YAML alone, exactly as if the field were absent.
3. An implementation that binds mocks to a real GraphQL type system — serving
   introspection, validating incoming query documents, or checking response
   shapes — **MUST** accept the schema through this field. It **MAY**
   additionally offer its own mechanisms (flags, registries, extensions), but
   a document that carries `schema` **MUST NOT** need any of them.
4. A missing or unreadable schema is **not** a document error. The
   implementation **SHOULD** report a diagnostic and **MUST** still resolve
   normalized requests exactly as without the field; only the capabilities the
   schema would have enabled are lost.
5. With a schema in hand, an implementation **SHOULD** surface a diagnostic
   when a document contradicts it (an unknown field in `data`, a scalar where
   the schema declares an object). The corpus only contains documents that
   agree with their schemas, so both strict and lenient engines conform.

### 3.6 Document validity

A document is **invalid** when it violates any requirement this
specification places on documents: it fails the
[JSON Schema](../schema/openmock-0.2.0.json), targets a format version the
implementation does not support ([§3.1](#31-openmock-required)), declares no
server, a server without operations, two servers sharing a `name`, or a
legacy top-level `operations` list ([§3.3](#33-servers-required)), uses a
facet under a protocol that does not list it ([§6.1](#61-when)), carries a
response whose shape disagrees with its operation
([§5.4](#54-grpc-operations), [§7.3](#73-grpc-responses)–[§7.5](#75-websocket-responses)),
names a faker category/method the implementation does not know
([§9.3](#93-faker)), carries a facet `pattern` that is not valid RE2
([§6.1](#61-when)), or declares an inverted `calls` range with `min > max`
([§6.3](#63-the-calls-facet-and-the-call-counter)). The schema is a floor,
not the whole rule: some invalidity — an unknown faker, a malformed pattern,
an inverted range — is not schema-expressible.

1. An implementation **MUST NOT serve an invalid document.** It **MUST**
   refuse the document at **load time**, before answering any request, and
   **SHOULD** emit a diagnostic identifying the violation and where it is
   (operation, scenario).
2. **Partial service is not an option.** An implementation **MUST NOT**
   skip an invalid operation or scenario and serve the rest — a silently
   dropped operation surfaces later as a baffling unrouted 404 in someone's
   test run.
3. **Validity is static.** Every rule above is checkable from the document
   alone — templating placeholders are literal strings, so an
   implementation can enumerate every `{{faker.*}}` placeholder without
   rendering a single response. Detection **MUST NOT** be deferred to
   matching or render time, where it would surface as a per-request
   failure. (This is why an unknown faker fails the *load*, not the first
   request that happens to render it.)
4. Invalidity is a property of the **document**, not its environment. A
   missing or unreadable `descriptorSet` or GraphQL `schema` file remains a
   diagnostic, never a document error ([§3.4](#34-grpc-servers-descriptorset),
   [§3.5](#35-graphql-servers-schema)); unrecognized `x-` keys are ignored
   ([§11](#11-specification-extensions)); an unresolved *data* placeholder
   renders the empty string ([§9.2](#92-unresolved-placeholders)).

The conformance corpus pins this behavior with **invalid-document cases**:
a case that carries `invalid.json` instead of a request/response pair names
a document the implementation **MUST refuse to load**
([§12](#12-conformance)).

## 4. The request model

Matching and templating are defined against a **normalized request**, so the
format stays transport-agnostic. An implementation maps a real incoming request
onto the model for its protocol. A normalized request carries a `protocol`
field (`http`, `grpc`, `graphql`, or `websocket`); when absent it is `http`.
It **MAY** carry a `server` field: the **name** of the server it targets
([§3.3](#33-servers-required)), which is what routing selects first
([§8](#8-matching-algorithm)). When `server` is **absent** and the document
declares **exactly one** server of the request's protocol, the request
targets that server; with zero or several such servers, an absent `server`
leaves the request **unrouted** ([§10.2](#102-no-operation-matches)) —
omission is a convenience for the common single-server document, never a
tiebreaker. How an implementation attributes a real incoming request to a
server name — a port per server, a host header, a dedicated socket — is a
transport concern, exactly as TLS is.

### 4.1 HTTP requests

| Field     | Type   | Description                                              |
| --------- | ------ | ------------------------------------------------------- |
| `server`  | string | Name of the server the request targets ([§3.3](#33-servers-required)). MAY be omitted when the document declares exactly one server of this protocol ([§8](#8-matching-algorithm)). |
| `method`  | string | Request method, compared case-insensitively.            |
| `path`    | string | Request path without query string, as received — percent-encoding preserved (decoding happens per segment during matching, [§5.2](#52-path-and-path-parameters)). E.g. `/users/42`. |
| `params`  | object | Path parameters extracted by matching `path` (see §5.2).|
| `query`   | object | Query-string parameters, name→value; a repeated name carries a **list** of its values in wire order ([§4.6](#46-multi-valued-fields)). |
| `headers` | object | Header name→value; names compared case-insensitively; repeated field lines join with `", "` ([§4.6](#46-multi-valued-fields)). |
| `body`    | any    | Parsed request body (object/array/scalar), or absent.   |

`params` is derived by the router and `server` by the transport mapping; the
others come from the incoming request.

### 4.2 gRPC requests

| Field      | Type   | Description                                                  |
| ---------- | ------ | ------------------------------------------------------------ |
| `server`   | string | Name of the server the request targets ([§3.3](#33-servers-required)). MAY be omitted when the document declares exactly one server of this protocol ([§8](#8-matching-algorithm)). |
| `service`  | string | Fully-qualified service name, e.g. `shop.v1.OrderService`.   |
| `rpc`      | string | RPC method name, e.g. `GetOrder`.                            |
| `metadata` | object | Request metadata (the client's call headers), key→value; keys compared case-insensitively; repeated keys join with `", "` ([§4.6](#46-multi-valued-fields)). Unambiguous on the request side: gRPC clients send no trailing metadata. |
| `message`  | any    | The request message as data (object/array/scalar), or absent.|

Messages are represented as plain data following the
[proto3 JSON mapping](https://protobuf.dev/programming-guides/proto3/#json)
(field names, not wire bytes). How an implementation binds these
representations to actual protobuf encoding — server reflection, descriptor
sets, transcoding — is an implementation concern, exactly as ports and TLS are
for HTTP. A gRPC server **MAY** attach its compiled protobuf schema portably
through its `descriptorSet` field ([§3.4](#34-grpc-servers-descriptorset)).

So that the same document matches the same requests on every engine, the
following consequences of the JSON mapping are normative here:

- **Field names** are the proto3 **JSON names** — lowerCamelCase by default
  (`order_id` in the `.proto` is `orderId` here). Documents address fields by
  JSON name in facets, templates, and messages, and an implementation that
  normalizes wire requests **MUST** present message keys under their JSON
  names.
- **Scalar forms** follow the mapping: 64-bit integers (`int64`, `uint64`,
  `fixed64`, `sfixed64`) are decimal **strings** (`level: "42"`), enum values
  are their **names** (`state: SHIPPED`), `bytes` are base64 strings, and
  well-known types use their JSON forms (e.g. `google.protobuf.Timestamp` as
  an RFC 3339 string). Facet comparison ([§6.1](#61-when)) and
  templating ([§9](#9-templating)) operate on these forms.

### 4.3 GraphQL requests

| Field           | Type   | Description                                                    |
| --------------- | ------ | -------------------------------------------------------------- |
| `server`        | string | Name of the server the request targets ([§3.3](#33-servers-required)). MAY be omitted when the document declares exactly one server of this protocol ([§8](#8-matching-algorithm)). |
| `operationType` | string | `query` or `mutation`.                                          |
| `operationName` | string | The GraphQL operation name, e.g. `GetOrder`. Case-sensitive.    |
| `variables`     | object | The request's variables as data (object), or absent.            |
| `headers`       | object | Transport header name→value; names compared case-insensitively; repeated field lines join with `", "` ([§4.6](#46-multi-valued-fields)). |

A GraphQL request document names its operation (`query GetOrder(...) { ... }`);
that name and the operation type are what OpenMock routes on
([§5.6](#56-graphql-operations)). How an implementation obtains these values —
parsing the `query` text of a GraphQL-over-HTTP POST, reading the
`operationName` request parameter, a persisted-query lookup — is an
implementation concern, exactly as ports and TLS are for HTTP. Requests whose
operation cannot be named (anonymous operations) have no normalized form in
v0.2; how an implementation treats them is likewise an implementation concern.

The **selection set is deliberately not part of the model**. A mock declares
its response data literally, so there is nothing to select against: an
implementation **MUST** emit the declared `data` exactly as written
([§7.4](#74-graphql-responses)), not filtered or expanded by the request's
selection set. An engine that consumes the document's schema
([§3.5](#35-graphql-servers-schema)) may gain validation and introspection, but the
resolved response stays the same.

### 4.4 WebSocket requests

WebSocket is message-oriented: a client establishes a connection to a path and
then sends messages over it. **Each inbound client message is one normalized
request.** The connection itself produces no request — v0.2 mocks speak only
in reply to a client message ([§5.8](#58-websocket-operations)).

| Field        | Type   | Description                                                     |
| ------------ | ------ | --------------------------------------------------------------- |
| `server`     | string | Name of the server the connection targets ([§3.3](#33-servers-required)). MAY be omitted when the document declares exactly one WebSocket server ([§8](#8-matching-algorithm)). Connection-scoped: fixed at establishment. |
| `path`       | string | The connection's request path without query string, as received — percent-encoding preserved ([§5.2](#52-path-and-path-parameters)), e.g. `/ws/orders/42`. |
| `params`     | object | Path parameters extracted by matching the operation's `path` (see §5.2). |
| `query`      | object | Query-string parameters of the connection URL, name→value; a repeated name carries a **list** of its values in wire order ([§4.6](#46-multi-valued-fields)). |
| `headers`    | object | Connection (upgrade) request headers; names compared case-insensitively; repeated field lines join with `", "` ([§4.6](#46-multi-valued-fields)). |
| `connection` | string | Opaque identifier of the connection the message arrived on.     |
| `message`    | any    | The parsed incoming message (object/array/scalar).              |

`path`, `params`, `query`, `headers`, and `connection` are **connection-scoped**:
they are fixed when the connection is established and identical for every
message on it. `message` is the one per-request field.

`connection` distinguishes one connection from another — it is what the
per-connection call counter is keyed by
([§6.3](#63-the-calls-facet-and-the-call-counter)). Its value is opaque; an
implementation derives it however it likes (a socket id, a UUID). Two
normalized requests with equal `connection` values belong to the same
connection. When the field is absent, all requests belong to one default
connection.

Messages are data, exactly like bodies and gRPC messages. How an
implementation maps wire frames onto that data — typically parsing JSON text
frames, with a plain text frame normalizing to a string scalar — and how it
serializes reply messages back onto the wire is an implementation concern,
exactly as ports and TLS are for HTTP. A frame that normalized to a string
scalar is matched with the scalar form of the `message` facet
([§6.1](#61-when)) and rendered with bare `{{request.message}}`
([§9.1](#91-placeholder-namespaces)).

### 4.5 Dotted paths and string forms

Matching ([§6.1](#61-when)) and templating ([§9](#9-templating)) both address
values inside the structured request payloads — `body` (HTTP), `message`
(gRPC, WebSocket), and `variables` (GraphQL) — with **dotted paths**, and both
reduce what they find to a value's **canonical string form** before comparing
or rendering it. Both definitions live here, once, so the two features cannot
drift apart.

#### Dotted paths

A dotted path is one or more non-empty **segments** joined by `.`:

```
path    = segment *( "." segment )
segment = one or more characters, none of which is "."
```

Every `.` is a segment separator — there is no escape syntax. A member whose
name contains a literal dot therefore **cannot be addressed** in v0.2. This is
a deliberate limitation: a future version may add an escape syntax, but the
meaning of `.` will not change.

A path **resolves** by applying its segments left to right, starting at the
payload root. At each step, against the current value:

- If the current value is an **object**, the segment selects the member with
  exactly that name (case-sensitively). No such member → resolution fails.
- If the current value is an **array** and the segment is a **canonical
  base-10 integer** — one or more ASCII digits, no sign, no leading zeros
  (`0` is canonical) — the segment selects the element at that 0-based index.
  An index at or beyond the array's length, or a non-canonical segment
  (`01`, `-1`, `1x`), fails resolution.
- Against anything else (a string, number, boolean, or `null`), resolution
  fails.

A path whose resolution fails resolves to **absent**. Absent is not an error:
an absent target simply never matches a facet ([§6.1](#61-when)) and renders
as the empty string in a template ([§9.2](#92-unresolved-placeholders)).

Dotted paths apply **only** to `body`, `message`, and `variables` — the
facets and template namespaces that address structured payloads. The flat
facets (`params`, `query`, `headers`, `metadata`) and their template
namespaces are plain key lookups: a `.` in a header or query parameter name
is a literal character, never a separator.

```yaml
# Against a body of: { "items": [ { "id": "a1", "qty": 2 } ] }
when:
  body:
    items.0.qty: "2"     # index 0 into the array, then member "qty" → 2
    # items.1.id: …      # index past the end → absent → never matches
    # user.role: …       # no member "user" → absent ("." always separates)
```

#### Canonical string forms

Facet comparison and placeholder rendering treat request values uniformly by
reducing them to a **canonical string form**:

| Value                 | Canonical string form                                    |
| --------------------- | -------------------------------------------------------- |
| string                | the string itself, unchanged                              |
| boolean               | `true` or `false`                                         |
| number                | the shortest decimal string that round-trips to the same IEEE 754 double — the output of the ECMAScript `Number::toString` algorithm, which is what `JSON.stringify` emits |
| `null`, object, array | **none** — these values have no canonical string form     |

Consequences of the number rule: `42` → `42`; `1.0` → `1` (a fractionless
double and the integer are the same value); `0.5` → `0.5`; `-0` → `0`;
integers of magnitude up to 2⁵³ never gain a fraction or an exponent. An
engine whose parser preserves more precision than an IEEE 754 double (64-bit
or arbitrary-precision integers) renders such values in plain decimal form;
the conformance corpus stays within the double-safe range.

Because comparison operates on string forms, a facet cannot distinguish the
JSON number `42` from the JSON string `"42"` — both have the form `42`. This
is deliberate: values that arrive as text on the wire (query parameters, path
segments, headers) and values that arrive typed (JSON payloads) are matched
by one rule.

`null` has no string form **by design**: a `null` target behaves exactly like
an absent one — it matches no facet value and renders as the empty string.
v0.2 offers no way to distinguish `null` from absent, in matching or in
templating.

### 4.6 Multi-valued fields

The maps in the normalized request are single-stringed by default, but wires
are not: a query string may repeat a name (`?a=1&a=2`), and HTTP requests
and gRPC calls may repeat a header or metadata key. How each map represents
repetition is normative:

- **Repeated headers and metadata** normalize to **one string**: every value
  the transport delivered for that name, in arrival order, joined with
  `", "` (a comma and a single space). This is RFC 9110's rule — repeated
  field lines are semantically one comma-separated list — applied at
  normalization time, so nothing is dropped. It covers HTTP request headers,
  gRPC request metadata, and the transport headers of GraphQL and WebSocket
  requests alike. Matching and templating see only the joined value: a facet
  `X-Tag: alpha` does **not** match a request that sent `X-Tag: alpha` and
  `X-Tag: beta` (the normalized value is `alpha, beta`); an author who wants
  to match the repetition writes the joined form.
- **Repeated query parameters are preserved as a list.** Query strings,
  unlike header fields, have no standard joining semantics — and repetition
  can be the encoding of the data itself (a gRPC-JSON transcoder renders a
  repeated proto field as `?ids=1&ids=2`), so no occurrence may be dropped.
  A `query` value is therefore a **string** when the name appeared once and
  a **list of strings, in wire order**, when it was repeated.

Because a `query` value can be a list, the `query` facet has exactly one
rule of its own:

- A `query` facet value is **always a non-empty list of strings**. It
  matches iff the parameter's full occurrence sequence equals it — same
  values, same order, same count. A single occurrence is a one-element
  sequence: `verbose: ["true"]` matches `?verbose=true` and nothing else.
  `ids: ["1", "2"]` matches `?ids=1&ids=2` but not `?ids=1`,
  `?ids=2&ids=1`, or `?ids=1&ids=2&ids=3`. There is no string form and no
  hidden single-value shortcut — one rule covers one occurrence and many.
- Templating follows the ordinary string-form rules of
  [§4.5](#45-dotted-paths-and-string-forms): `{{request.query.NAME}}`
  renders a single-valued parameter's value, and renders the **empty
  string** for a repeated one ([§9.2](#92-unresolved-placeholders)).

On the **response** side the concern is reversed — emitting repetition, not
normalizing it — and only HTTP needs it, for the one header that RFC 6265
forbids comma-joining: `Set-Cookie`. An HTTP response header value MAY
therefore be a **list of strings**, emitted as one field line per item, in
order ([§7](#7-the-response-object)). gRPC response `metadata` and
`trailers` ([§7.3](#73-grpc-responses)) stay string-valued: metadata has no
`Set-Cookie` analog — a comma-joined value is semantically the repetition,
for ASCII and base64 `-bin` values alike — so an author who wants repeated
metadata or trailer entries writes the joined value.

## 5. Operations

An operation object declares one addressable route and the scenarios for it.
Operations live in a server's `operations` list
([§3.3](#33-servers-required)); the server's `type` determines the
operation's shape — there is no per-operation protocol field. A document that
mocks several protocols declares several servers, one per service.

### HTTP operations

```yaml
servers:
  - name: users-api
    type: http
    operations:
      - method: GET          # REQUIRED
        path: /users/{id}    # REQUIRED
        scenarios:           # REQUIRED — at least one
          - ...
```

| Field        | Type   | Required | Description                                   |
| ------------ | ------ | -------- | --------------------------------------------- |
| `method`     | string | yes      | HTTP method. Compared case-insensitively.     |
| `path`       | string | yes      | Path template with optional `{param}` segments.|
| `summary`    | string | no       | Optional human-oriented description.          |
| `scenarios`  | list   | yes      | Ordered, non-empty list of scenarios.         |

### 5.1 `method`

Any HTTP method token (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`,
`OPTIONS`, …). Comparison against a request is case-insensitive.

### 5.2 `path` and path parameters

`path` is an absolute path that **MUST** begin with `/`. A segment written as
`{name}` is a **path parameter** that matches exactly one non-empty path segment
and captures it under that name.

- `/users/{id}` matches `/users/42` → `params.id = "42"`.
- `/users/{id}` does **not** match `/users` or `/users/42/posts`.
- Multiple parameters are allowed: `/users/{userId}/posts/{postId}`.
- A parameter matches a single segment only; it never spans `/`.

Two operations **in one server SHOULD NOT** declare the same `method` +
`path`. If they do, an implementation **MUST** consider them in the server's
`operations` order and use the first. Operations of *different* servers never
conflict: two servers may both declare `GET /health`, and each answers its
own requests ([§8](#8-matching-algorithm)).

#### Path comparison

A template matches a request path **segment for segment**:

1. **Split.** Template and request path each drop the leading `/` and split
   on `/`. A trailing slash yields a trailing **empty segment**, so `/users`
   splits to `["users"]` and `/users/` to `["users", ""]`. A template
   matches only a request path with the **same number of segments**.
2. **Decode.** Each *request* segment is then percent-decoded: `%` followed
   by two hex digits becomes the encoded octet, and the octets are
   interpreted as UTF-8. A segment containing a malformed escape (`%zz`, a
   trailing `%`) is compared as written. `+` is **not** decoded — it means a
   space only in query strings, never in paths. Because splitting happens
   **before** decoding, an encoded `%2F` can never act as a segment
   separator.
3. **Compare.** A literal template segment matches iff it equals the decoded
   request segment — **case-sensitively**, with no Unicode case folding or
   other normalization. Template segments are compared exactly as written in
   the YAML; authors write them in decoded form. An empty literal segment
   (from a trailing slash) matches only an empty request segment.
4. **Capture.** A `{name}` segment matches any **non-empty** decoded segment
   and captures the **decoded** value: `/files/{name}` matches
   `/files/a%2Fb.txt` with `params.name = "a/b.txt"`. The captured value is
   what the `params` facet ([§6.1](#61-when)) and `{{params.NAME}}`
   ([§9](#9-templating)) see.

There is **no other normalization**: paths are never case-folded, `/users`
and `/users/` are distinct (an author who wants both declares both), and
dot-segments (`.`, `..`) are not resolved during matching — resolving them,
like every other URL normalization that precedes the normalized request,
is the transport mapping's concern, exactly as ports and TLS are.

### 5.3 Route resolution

For an incoming request, an implementation selects the **first** operation, in
the addressed server's `operations` list ([§8](#8-matching-algorithm) step 1),
whose `method` matches and whose `path` template matches the request path. If
routing selects no target server ([§8](#8-matching-algorithm) step 1), or no
operation in the targeted server matches, the request is **unrouted** (see
[§10.2](#102-no-operation-matches)).

### 5.4 gRPC operations

```yaml
servers:
  - name: orders-grpc
    type: grpc
    operations:
      - service: shop.v1.OrderService   # REQUIRED — fully-qualified service name
        rpc: GetOrder                   # REQUIRED — RPC method name
        type: unary                     # OPTIONAL — unary (default) | server-streaming
        scenarios:                      # REQUIRED — at least one
          - ...
```

| Field        | Type   | Required | Description                                          |
| ------------ | ------ | -------- | ---------------------------------------------------- |
| `service`    | string | yes      | Fully-qualified service name. Compared case-sensitively (protobuf names are case-sensitive). |
| `rpc`        | string | yes      | RPC method name. Compared case-sensitively.          |
| `type`       | string | no       | The RPC's **call type**: `unary` (the default) or `server-streaming`. |
| `summary`    | string | no       | Optional human-oriented description.                 |
| `scenarios`  | list   | yes      | Ordered, non-empty list of scenarios.                |

The call type is declared **explicitly on the operation** — it is never
inferred from the shape of a response. Every response in a `unary` operation
uses `message`; every response in a `server-streaming` operation uses
`messages` ([§7.3](#73-grpc-responses)). A response whose shape does not agree
with the operation's declared `type` makes the document **invalid**
([§3.6](#36-document-validity)). Authors
**SHOULD** write `type` explicitly even for unary RPCs.

Client-streaming and bidirectional call types are not part of v0.2.

### 5.5 gRPC route resolution

For an incoming gRPC request, an implementation selects the **first**
operation, in the addressed server's `operations` list
([§8](#8-matching-algorithm) step 1), whose `service` and `rpc` both equal
the request's. There are no path parameters and no query strings in gRPC
addressing. If routing selects no target server
([§8](#8-matching-algorithm) step 1), or no operation in the targeted server
matches, the request is **unrouted** (see
[§10.2](#102-no-operation-matches)).

Two operations in one server **SHOULD NOT** declare the same `service` +
`rpc`. If they do, an implementation **MUST** consider them in the server's
`operations` order and use the first.

### 5.6 GraphQL operations

```yaml
servers:
  - name: shop-graphql
    type: graphql
    operations:
      - operationType: query            # OPTIONAL — query (default) | mutation
        operationName: GetOrder         # REQUIRED — the GraphQL operation name
        scenarios:                      # REQUIRED — at least one
          - ...
```

| Field           | Type   | Required | Description                                          |
| --------------- | ------ | -------- | ---------------------------------------------------- |
| `operationType` | string | no       | `query` (the default) or `mutation`.                 |
| `operationName` | string | yes      | The GraphQL operation name this route answers. Compared case-sensitively (GraphQL names are case-sensitive). |
| `summary`       | string | no       | Optional human-oriented description.                 |
| `scenarios`     | list   | yes      | Ordered, non-empty list of scenarios.                |

`operationName` is the name a client gives its request document — the
`GetOrder` in `query GetOrder($id: ID!) { order(id: $id) { … } }`. Mocking
addresses requests by this name rather than by root field or query text: it is
present on every named request, it survives persisted-query indirection, and
it keeps a document readable as a list of the calls a client makes.

GraphQL subscriptions are not part of v0.2.

### 5.7 GraphQL route resolution

For an incoming GraphQL request, an implementation selects the **first**
operation, in the addressed server's `operations` list
([§8](#8-matching-algorithm) step 1), whose `operationType` and
`operationName` both equal the request's. There are no path parameters and no
query strings in GraphQL addressing. If routing selects no target server
([§8](#8-matching-algorithm) step 1), or no operation in the targeted server
matches, the request is **unrouted** (see [§10.2](#102-no-operation-matches)).

Two operations in one server **SHOULD NOT** declare the same `operationType`
+ `operationName`. If they do, an implementation **MUST** consider them in
the server's `operations` order and use the first.

### 5.8 WebSocket operations

```yaml
servers:
  - name: orders-feed
    type: websocket
    operations:
      - path: /ws/orders/{id}           # REQUIRED — connection path template
        scenarios:                      # REQUIRED — at least one
          - ...
```

| Field        | Type   | Required | Description                                          |
| ------------ | ------ | -------- | ---------------------------------------------------- |
| `path`       | string | yes      | Path template the connection is established against, with optional `{param}` segments. Same rules as [§5.2](#52-path-and-path-parameters). |
| `summary`    | string | no       | Optional human-oriented description.                 |
| `scenarios`  | list   | yes      | Ordered, non-empty list of scenarios.                |

A WebSocket operation describes one connection endpoint and the request/reply
exchanges on it: every message the client sends on a connection resolves,
per [§8](#8-matching-algorithm), against this operation's scenarios to a
response of zero or more reply messages, optionally followed by a close
([§7.5](#75-websocket-responses)).

v0.2 covers **client-initiated exchanges only** — the mock speaks only in
reply to a client message. Server-initiated messages (a greeting on connect,
unsolicited pushes) are not part of v0.2.

### 5.9 WebSocket route resolution

Routing happens **once, at connection establishment**: an implementation
selects the first operation, in the addressed server's `operations` list
([§8](#8-matching-algorithm) step 1), whose `path` template matches the
connection's path (capturing `params`). If routing selects no target server
([§8](#8-matching-algorithm) step 1), or no operation in the targeted server
matches, the connection is **unrouted** and **MUST be refused**, not accepted (see
[§10.2](#102-no-operation-matches)).

Every message on an established connection resolves against that one
operation — messages are not re-routed, since the connection's path and
server cannot change.

Two operations in one server **SHOULD NOT** declare the same `path`. If they
do, an implementation **MUST** consider them in the server's `operations`
order and use the first.

## 6. Scenarios

A scenario maps a matched request to a response. Scenarios live in an ordered
list and are evaluated **first-match-wins** (see [§8](#8-matching-algorithm)).

```yaml
- name: admin-user        # REQUIRED
  when:                   # OPTIONAL — omit for the default scenario
    headers:
      X-Role: admin
  response:               # REQUIRED
    status: 200
    body:
      id: "{{params.id}}"
      role: admin
```

| Field      | Type   | Required | Description                                        |
| ---------- | ------ | -------- | -------------------------------------------------- |
| `name`     | string | yes      | Identifier for the scenario, unique within the operation. |
| `summary`  | string | no       | Optional human-oriented description of the scenario's intent. Non-normative. |
| `when`     | object | no       | Condition under which this scenario applies. Omit for the default. |
| `response` | object | yes      | The [response](#7-the-response-object) to return.  |

### 6.1 `when`

A `when` object declares one or more **facets**. A facet constrains a part of
the request. A scenario matches only if **every declared facet matches**. Facets
that are absent from `when` are unconstrained.

| Facet     | Protocol | Matches against | Match rule                                |
| --------- | -------- | --------------- | ----------------------------------------- |
| `params`  | http, websocket | `request.params`| For each key, the captured path parameter equals the value (string equality). |
| `query`   | http, websocket | `request.query` | For each key, the value is a **list** matched against the parameter's full occurrence sequence exactly ([§4.6](#46-multi-valued-fields)); a single occurrence is a one-element sequence (`verbose: ["true"]`). |
| `headers` | http, graphql, websocket | `request.headers` | For each key (compared case-insensitively), the header is present and equals the value. |
| `body`    | http     | `request.body`  | Map form: for each key, the value at that dotted path ([§4.5](#45-dotted-paths-and-string-forms)) of the request body equals the value (e.g. `user.role`, `items.0.id`). Scalar form: a single string matching the whole payload (see below). |
| `metadata`| grpc     | `request.metadata` | For each key (compared case-insensitively), the metadata entry is present and equals the value. |
| `message` | grpc, websocket | `request.message` | Map form: for each key, the value at that dotted path ([§4.5](#45-dotted-paths-and-string-forms)) of the request message equals the value (e.g. `order.id`). Scalar form: a single string matching the whole payload (see below). |
| `variables` | graphql | `request.variables` | For each key, the value at that dotted path ([§4.5](#45-dotted-paths-and-string-forms)) of the request's variables equals the value (e.g. `filter.state`). |
| `calls`   | all      | the operation's call counter | The counter's current value equals the declared integer or falls within the declared range. See [§6.3](#63-the-calls-facet-and-the-call-counter). |

A facet may only appear under an operation whose server's `type` lists it
(`calls` is valid under all protocols); a document that uses, say, `headers`
in the `when` of an operation in a gRPC server is invalid
([§3.6](#36-document-validity)). A map-form facet **MUST** declare at least
one key: an empty facet map (`headers: {}`) is not a vacuously-true
constraint but an invalid document. For WebSocket operations, `params`,
`query`, and `headers` match the connection-scoped values fixed at
establishment ([§4.4](#44-websocket-requests)) and `message` matches the
individual inbound message.

The `body` and `message` facets have a second, **scalar form**: instead of a
map, the facet MAY be a single string, which matches iff the **whole
payload** has a canonical string form
([§4.5](#45-dotted-paths-and-string-forms)) equal to it. This is how scalar
payloads — a `text/plain` body of `ping`, a plain-text WebSocket frame, a
bare JSON number — are matched at all: `message: ping` matches the text
frame `"ping"`, and `body: "42"` matches a body of the JSON number `42`. A
payload that is an object, array, or `null` has no string form and never
matches the scalar form; conversely, a dotted path never resolves inside a
scalar payload, so the two forms cover disjoint payload shapes. (gRPC
messages under the proto3 JSON mapping are normally objects; the scalar
form exists there for the rare scalar normalizations, e.g. transcoded
well-known wrapper types.)

#### Value matchers

Wherever a facet accepts a **string** value, it also accepts a **matcher
object** — once more, the YAML type carries the meaning. v0.2 defines two
matchers, and a matcher object carries **exactly one** of them:

```yaml
when:
  headers:
    X-Trace:
      exists: true          # header must be present, any value
    X-Debug:
      exists: false         # header must be absent
  body:
    orderId:
      pattern: "ord-[0-9]+" # RE2, matches the ENTIRE value
```

A matcher is an **ordinary YAML mapping** — there is no matcher syntax.
`X-Debug: {exists: false}` is the same document in YAML's flow style; use
whichever style reads better. The only brace syntax OpenMock itself defines
is the **doubled** `{{ … }}` of templating placeholders inside string
values ([§9](#9-templating)).

| Matcher          | Matches when                                                        |
| ---------------- | ------------------------------------------------------------------- |
| `exists: true`   | The target is **present** — it resolves to any value, including an object or array. Presence is assertable even where equality is not. |
| `exists: false`  | The target is **absent** — the header/parameter/entry is missing, or the dotted path fails to resolve. `null` counts as absent ([§4.5](#45-dotted-paths-and-string-forms)). |
| `pattern: "…"`   | The target has a canonical string form ([§4.5](#45-dotted-paths-and-string-forms)) and the pattern matches **that entire string** — implicitly anchored, as if wrapped in `\A(?:…)\z`. Targets with no string form never match. |

Patterns use **RE2 syntax** — no backreferences, no lookaround. RE2 is the
one dialect with portable, linear-time implementations on every platform, so
a document can never smuggle in a catastrophically backtracking pattern. An
implementation whose regex engine accepts more than RE2 **MUST** still
reject non-RE2 patterns: a pattern that is not valid RE2 makes the document
**invalid** ([§3.6](#36-document-validity)) — a static, load-time check like
every other validity rule. Case-insensitivity is written inline:
`pattern: "(?i)shipped"`.

Two facets need a word on where matchers fit:

- **`query`** ([§4.6](#46-multi-valued-fields)): each **list element** may
  be a string or a `pattern` matcher, matched against the occurrence at
  that position — `ids: [{pattern: "[0-9]+"}, "2"]` — while count and order
  stay exact. The whole facet value may instead be an `exists` matcher,
  asserting the parameter's presence or absence regardless of values:
  `page: {exists: false}`. `exists` has no meaning *inside* the list (a
  position's existence is already asserted by the count).
- **`body` / `message`**: matchers appear as map-form **values** —
  `body: {orderId: {pattern: …}}`. At the **top level** of these facets an
  object is always the map form, because its keys are dotted paths and a
  member may legitimately be named `exists` or `pattern`; the whole-payload
  scalar form therefore stays a plain string, and whole-payload matchers
  are not expressible in v0.2.

Within a map-form facet, multiple keys are **ANDed** — all must match. Across facets, all
declared facets must match. For every facet except `calls`, a **string**
facet value compares by
**string equality on canonical string forms**
([§4.5](#45-dotted-paths-and-string-forms)): the facet key matches iff the
targeted request value is present, has a canonical string form, and that form
equals the string written in `when` — while an **object** facet value is a
matcher (above). Under string equality, a target that is absent, `null`, an
object, or an array never matches. In the flat facets (`params`, `query`,
`headers`, `metadata`) the key is a plain name; in `body`, `message`, and
`variables` it is a dotted path. Two facets carry their own comparison
rules instead: `query`, whose values are lists matched against the
occurrence sequence per [§4.6](#46-multi-valued-fields), and `calls`, which
compares integers as described in
[§6.3](#63-the-calls-facet-and-the-call-counter).

```yaml
when:
  query:
    verbose: ["true"]
  headers:
    X-Api-Key: secret
  body:
    user.role: admin
    items.0.qty: "2"
```

This scenario matches only a request that has `?verbose=true`, an
`X-Api-Key: secret` header, and a body whose `user.role` is `admin` and whose
first `items` element has a `qty` of `2`. String forms are what make typed
payload scalars matchable: `items.0.qty: "2"` matches whether the body carries
the JSON number `2` or the string `"2"`.

### 6.2 The default scenario

A scenario **without** a `when` object is the **default** (fallback) scenario. It
always matches. A default scenario **SHOULD** be placed **last** in the list,
because any scenario after it can never be reached (the default matches first
under first-match-wins).

An operation **MAY** omit a default scenario. If it does and no `when` scenario
matches, the request is **unmatched** (see [§10.1](#101-no-scenario-matches)).

An operation **SHOULD** declare at most one default scenario. If more than one is
present, only the first (in document order) is reachable.

### 6.3 The `calls` facet and the call counter

The `calls` facet matches on **how many times an operation has been called**,
which makes time-dependent flows — most importantly *polling* — expressible
without scripting or an explicit state machine.

#### The counter

An implementation maintains a **call counter** per **(server, operation,
concrete request path)** tuple:

- The counter is keyed by the *concrete* path of the request (after routing),
  so `GET /v1/file/abc` and `GET /v1/file/def` advance **independent** counters
  even though both route to `/v1/file/{hash}`. For gRPC operations the concrete
  address is `service` + `rpc`, and for GraphQL operations it is
  `operationType` + `operationName` — there are no path parameters, so in both
  cases the counter is effectively **per operation**.
- The counter lives inside its server: two servers never share counters, even
  when both declare the same operation address
  ([§3.3](#33-servers-required)).
- For **WebSocket** operations the counter is keyed by **(operation,
  connection)**: every message routed on a connection advances that
  connection's counter, so a scripted exchange starts from `1` on each new
  connection, and two concurrent connections never see each other's counts
  ([§4.4](#44-websocket-requests)).
- The counter is incremented by **every request routed to the operation**,
  after routing succeeds and **before** scenario selection, regardless of which
  scenario (if any) ends up matching. Unrouted requests increment nothing.
- The first request observes a counter value of `1`.
- The counter is **monotonic**: it never resets or wraps during a mock run.
  What constitutes a run (and when state is discarded) is an implementation
  concern — for example a CLI restart or a test-framework reset hook. Each
  conformance case starts from fresh state.

#### The facet

`calls` accepts either an **integer** or an **object** with inclusive bounds:

```yaml
when:
  calls: 3                # exactly the 3rd call
```

```yaml
when:
  calls:
    min: 2                # inclusive; optional
    max: 5                # inclusive; optional
```

- `calls: n` is shorthand for `calls: { min: n, max: n }`.
- In the object form at least one of `min`/`max` **MUST** be present. A missing
  `min` means "from the 1st call"; a missing `max` means "onward, forever"
  (so `{ min: 5 }` matches the 5th call and every call after it).
- Values are positive integers (the counter starts at 1).
- When both are present, `min` **MUST** be ≤ `max`. An inverted range
  (`{ min: 5, max: 2 }`) can never match, so a document declaring one is
  **invalid** ([§3.6](#36-document-validity)) — this is a semantic rule the
  JSON Schema cannot express (it compares no two values), enforced at load
  time like an unknown faker or a malformed pattern.

#### No special exhaustion rules

The `calls` facet introduces **no new fallback behaviour**. When the counter
moves past every declared value or range, the ordinary rules of
[§8](#8-matching-algorithm) apply:

- a **default scenario** (no `when`) catches all remaining calls — this is how
  "repeat the final response forever" is written, explicitly;
- with **no default**, the request is unmatched and yields the synthetic
  **501** of [§10.1](#101-no-scenario-matches).

Overlapping ranges likewise need no new rule: scenarios are evaluated in order
and the first match wins, exactly as everywhere else.

```yaml
# A polling lifecycle: 404 until "uploaded", pending while "analyzing",
# then done forever.
- method: GET
  path: /v1/file/{hash}
  scenarios:
    - name: not-uploaded-yet
      when: { calls: 1 }
      response: { status: 404, body: { error: not_found } }
    - name: analyzing
      when: { calls: { min: 2, max: 3 } }
      response: { status: 200, body: { status: pending } }
    - name: done            # default: the 4th call and beyond
      response: { status: 200, body: { status: done, verdict: clean } }
```

A document that never uses `calls` is a pure function of the request — nothing
about this facet affects stateless documents.

## 7. The response object

The response object's shape follows the operation's protocol: HTTP responses
are described here, gRPC responses in [§7.3](#73-grpc-responses), GraphQL
responses in [§7.4](#74-graphql-responses), and WebSocket responses in
[§7.5](#75-websocket-responses). The native-YAML rule
([§7.1](#71-native-yaml-bodies)), `delay` ([§7.2](#72-delay)), and templating
([§9](#9-templating)) apply to all of them.

```yaml
response:
  status: 200            # REQUIRED
  headers:               # OPTIONAL
    Content-Type: application/json
    Set-Cookie:          # a list emits one field line per item, in order
      - "session={{params.id}}; Path=/; HttpOnly"
      - "theme=dark; Path=/"
  delay: 250             # OPTIONAL — milliseconds
  body:                  # OPTIONAL — native YAML
    id: "{{params.id}}"
    name: Ada Lovelace
```

| Field     | Type    | Required | Description                                             |
| --------- | ------- | -------- | ------------------------------------------------------- |
| `status`  | integer | yes      | Response status code (e.g. `200`, `404`).               |
| `headers` | object  | no       | Response headers. Each value is a **string, or a list of strings** emitted as one field line per item, in order — for headers that cannot be comma-joined, like `Set-Cookie` ([§4.6](#46-multi-valued-fields)). Values (and each list item) may contain [templating placeholders](#9-templating). |
| `delay`   | integer | no       | Non-negative delay in **milliseconds** to wait before responding. Default `0`. |
| `body`    | any      | no       | The response body as **native YAML** — an object, array, or scalar. Omit for an empty body. |

### 7.1 Native YAML bodies

`body` is written as ordinary YAML, never as an escaped JSON string. The value
is the body: a mapping becomes a JSON object, a sequence becomes an array, a
scalar becomes a scalar.

```yaml
body:
  users:
    - id: "1"
      name: Ada
    - id: "2"
      name: Alan
```

String values (and header values) are scanned for
[templating placeholders](#9-templating) before the body is emitted. Non-string
scalars (numbers, booleans, null) are emitted as-is.

### 7.2 `delay`

`delay` expresses an artificial latency in milliseconds. An implementation
**SHOULD** wait approximately that long before emitting the response. `delay` is
a property of the chosen response; it is applied only when that response is
selected. For a server-streaming gRPC response, `delay` is applied once,
**before the first message**; per-message pacing is not part of v0.2. A
WebSocket response behaves the same way: `delay` is applied once, before the
first reply message (or before the `close`, if there are no messages).

### 7.3 gRPC responses

```yaml
# On a type: unary operation
response:
  status: OK               # REQUIRED — canonical gRPC status code name
  metadata:                # OPTIONAL — initial metadata (headers)
    x-trace-id: "{{request.metadata.x-trace-id}}"
  trailers:                # OPTIONAL — trailing metadata (trailers)
    x-cache: miss
  delay: 250               # OPTIONAL — milliseconds
  message:                 # unary response message, native YAML
    id: "{{request.message.orderId}}"
    state: SHIPPED
```

```yaml
# On a type: server-streaming operation
response:
  status: OK
  messages:                # ordered; emitted first to last
    - event: CREATED
    - event: PAID
    - event: SHIPPED
```

| Field      | Type    | Required | Description                                            |
| ---------- | ------- | -------- | ------------------------------------------------------ |
| `status`   | string  | yes      | A canonical gRPC status code name (see below).         |
| `error`    | string  | no       | The gRPC status message accompanying a non-OK `status`. May contain [templating placeholders](#9-templating). |
| `metadata` | object  | no       | **Initial** response metadata (the call's headers), string→string, sent before the first message. Values may contain templating placeholders. |
| `trailers` | object  | no       | **Trailing** response metadata (the call's trailers), string→string, sent with the final `status`. Values may contain templating placeholders. |
| `delay`    | integer | no       | Non-negative delay in milliseconds. Default `0`.       |
| `message`  | any     | no       | The response message, native YAML. **Only on `type: unary` operations.** |
| `messages` | list    | no       | Ordered response messages, native YAML. **Only on `type: server-streaming` operations.** |

`status` is one of the canonical gRPC code names: `OK`, `CANCELLED`, `UNKNOWN`,
`INVALID_ARGUMENT`, `DEADLINE_EXCEEDED`, `NOT_FOUND`, `ALREADY_EXISTS`,
`PERMISSION_DENIED`, `RESOURCE_EXHAUSTED`, `FAILED_PRECONDITION`, `ABORTED`,
`OUT_OF_RANGE`, `UNIMPLEMENTED`, `INTERNAL`, `UNAVAILABLE`, `DATA_LOSS`,
`UNAUTHENTICATED`. Names, not numbers — `NOT_FOUND`, never `5`.

Shape rules:

- The response message field **MUST** agree with the operation's declared
  `type` ([§5.4](#54-grpc-operations)): `message` on unary operations,
  `messages` on server-streaming operations, never both, never crossed.
- A **unary** response with a non-OK `status` **MUST NOT** carry a `message` —
  a gRPC unary call yields either a response message or an error status, not
  both.
- A **server-streaming** response **MAY** combine `messages` with a non-OK
  `status`: the messages are emitted in order and the stream then terminates
  with that status. This models a stream that fails mid-way. `messages` MAY be
  empty or absent for a stream that ends (or errors) without emitting.
- `error` carries the status message for non-OK statuses; it has no meaning
  with `status: OK`.
- `metadata` is **initial** metadata: it is emitted before the first
  response message. `trailers` is **trailing** metadata: it is emitted with
  the final `status`. Both are valid on any response, OK or not, unary or
  streaming — this is the distinction every real gRPC implementation
  carries, made explicit. How the two sets are framed on the wire —
  including gRPC's *trailers-only* framing for failed calls that send no
  initial metadata — is a transport concern, exactly as ports and TLS are
  for HTTP.

### 7.4 GraphQL responses

```yaml
response:
  delay: 250               # OPTIONAL — milliseconds
  data:                    # the data payload, native YAML
    order:
      id: "{{request.variables.orderId}}"
      state: SHIPPED
```

```yaml
# An error response — and a partial response, since data and errors coexist.
response:
  data:
    order: null
  errors:
    - message: order not found
      path: [order]
      extensions:
        code: NOT_FOUND
```

| Field        | Type    | Required | Description                                              |
| ------------ | ------- | -------- | -------------------------------------------------------- |
| `data`       | any     | no*      | The response's data payload as native YAML.               |
| `errors`     | list    | no*      | GraphQL errors (see below), in order.                     |
| `extensions` | object  | no       | Top-level response extensions: the free-form, machine-readable map the GraphQL specification permits alongside `data`/`errors` (distinct from a per-error `extensions`). |
| `delay`      | integer | no       | Non-negative delay in milliseconds. Default `0`.          |

\* At least one of `data` / `errors` **MUST** be present — a GraphQL response
carries data, errors, or both (a *partial response*, where `data` holds what
resolved and `errors` explains what did not).

There is no `status` field: GraphQL signals failure in-band through `errors`,
not through a transport status. How a response maps onto the transport (for
GraphQL-over-HTTP, typically `200` with an `application/json` body) is an
implementation concern.

Each entry in `errors` is a **GraphQL error object**:

| Field        | Type   | Required | Description                                                   |
| ------------ | ------ | -------- | ------------------------------------------------------------- |
| `message`    | string | yes      | Human-readable error description.                              |
| `locations`  | list   | no       | Source positions, each `{line, column}` (1-based integers).    |
| `path`       | list   | no       | Path to the response field the error concerns: field names (strings) and list indices (integers). |
| `extensions` | object | no       | Free-form, machine-readable error details (e.g. a `code`).     |

These are the four members the GraphQL specification defines for an error;
no other keys are permitted. `extensions` is intentionally unconstrained.

### 7.5 WebSocket responses

```yaml
response:
  delay: 100               # OPTIONAL — before the first reply message
  messages:                # ordered reply messages; emitted first to last
    - type: ack
      requestId: "{{request.message.requestId}}"
```

```yaml
# Reply, then close the connection.
response:
  messages:
    - type: goodbye
  close:
    code: 1000
    reason: client requested close
```

| Field      | Type    | Required | Description                                              |
| ---------- | ------- | -------- | -------------------------------------------------------- |
| `messages` | list    | no*      | Ordered reply messages, native YAML, emitted first to last. **MAY** be empty. |
| `close`    | object  | no*      | Close the connection after the last message. Optional `code` (a WebSocket close code, `1000`–`4999`; default `1000`) and optional `reason` string, which may contain [templating placeholders](#9-templating). |
| `delay`    | integer | no       | Non-negative delay in milliseconds. Default `0`.          |

\* At least one of `messages` / `close` **MUST** be present.

Shape rules:

- The reply is emitted in order: every entry of `messages`, then the `close`
  (if declared). A connection without a `close` stays open for further
  exchanges.
- An **empty** `messages` list with no `close` deliberately ignores the
  inbound message — a real need (heartbeats, fire-and-forget commands) made
  explicit rather than expressed by omission.
- There is no status field: WebSocket has no per-message status. An
  author-declared failure is a reply message shaped like an error, or a
  `close` with an application close code (`4000`–`4999`).

## 8. Matching algorithm

Given a normalized request, an implementation resolves a response as follows.

1. **Route.** Select the **target server**: the one whose `name` equals the
   request's `server` field ([§3.3](#33-servers-required)) or, when the
   field is absent, the document's **sole** server of the request's protocol
   ([§4](#4-the-request-model)). If the named server does not exist, its
   `type` differs from the request's protocol, or the field is absent while
   the document declares zero or more than one server of that protocol, the
   request is **unrouted** ([§10.2](#102-no-operation-matches)). Then select the first
   operation, in that server's `operations` list, that matches the request's
   address — for HTTP, `method` (case-insensitive) plus the `path` template
   (capturing `params`, [§5.3](#53-route-resolution)); for gRPC, `service`
   plus `rpc` ([§5.5](#55-grpc-route-resolution)); for GraphQL,
   `operationType` plus `operationName`
   ([§5.7](#57-graphql-route-resolution)); for WebSocket, the `path`
   template, evaluated once at connection establishment and reused for every
   message on the connection ([§5.9](#59-websocket-route-resolution)). If
   none matches, the request is likewise **unrouted** and no counter is
   incremented.
2. **Count.** Increment the operation's call counter for the request's concrete
   address ([§6.3](#63-the-calls-facet-and-the-call-counter)). This happens
   before scenario selection and regardless of its outcome.
3. **Select scenario.** Walk the operation's `scenarios` in document order. For
   each scenario:
   - If it has no `when`, it matches (it is the default).
   - If it has a `when`, it matches iff every declared facet matches per
     [§6.1](#61-when).
   Choose the **first** scenario that matches. This is *first-match-wins*.
4. **No match.** If no scenario matches (there was no default and no `when`
   matched), the request is **unmatched** ([§10.1](#101-no-scenario-matches)).
5. **Render.** Render the chosen scenario's `response`: substitute templating
   placeholders ([§9](#9-templating)), then apply `delay` and emit the
   response — `status`, `headers`, and `body` for HTTP; `status`, `error`,
   `metadata`, `trailers`, and `message`/`messages` for gRPC (streamed
   messages are emitted in list order, initial metadata before the first,
   trailers with the status); `data` and `errors` for GraphQL; `messages`
   then `close` for WebSocket.

Because evaluation stops at the first match, scenario **order is significant**:
put the most specific `when` scenarios first and the default last.

## 9. Templating

String values inside `response.body` and `response.headers` (HTTP —
including each item of a list-valued header), inside
`response.message`, `response.messages`, `response.metadata`,
`response.trailers`, and `response.error` (gRPC),
inside `response.data`, `response.errors`, and `response.extensions`
(GraphQL), and inside
`response.messages` and `response.close.reason` (WebSocket), may
contain placeholders of the form `{{ expression }}`. Whitespace inside the braces is
ignored, so `{{params.id}}` and `{{ params.id }}` are equivalent.

A placeholder in running text is replaced by a rendered **string** (its
canonical string form, [§4.5](#45-dotted-paths-and-string-forms)). A value
that is **exactly one placeholder** and nothing else, in a native-payload
position, instead takes the resolved value's **native type** — a number
stays a number, an object an object ([§9.4](#94-whole-value-placeholders-and-typed-output)).
The braces themselves are escapable ([§9.5](#95-literal-text-and-escaping)).

### 9.1 Placeholder namespaces

| Placeholder                | Resolves to                                              |
| -------------------------- | ------------------------------------------------------- |
| `{{params.NAME}}`          | The captured path parameter `NAME`.                     |
| `{{request.body}}`         | The whole request body, rendered by its canonical string form ([§4.5](#45-dotted-paths-and-string-forms)). |
| `{{request.body.PATH}}`    | The value at dotted `PATH` in the request body.         |
| `{{request.headers.NAME}}` | The request header `NAME` (case-insensitive).           |
| `{{request.query.NAME}}`   | The request query parameter `NAME` when single-valued; a repeated parameter is a list and renders as the empty string ([§4.6](#46-multi-valued-fields)). |
| `{{request.message}}`      | The whole gRPC or WebSocket request message, rendered by its canonical string form ([§4.5](#45-dotted-paths-and-string-forms)). |
| `{{request.message.PATH}}` | The value at dotted `PATH` in the gRPC or WebSocket request message. |
| `{{request.metadata.NAME}}`| The gRPC request metadata entry `NAME` (case-insensitive). |
| `{{request.variables.PATH}}`| The value at dotted `PATH` in the GraphQL request variables. |
| `{{faker.CATEGORY.METHOD}}`| A generated fake value (see [§9.3](#93-faker)).          |
| `{{ "TEXT" }}`             | The literal string `TEXT` (single or double quotes). The escape for `{{`/`}}` and a literal-text injector — see [§9.5](#95-literal-text-and-escaping). |

`request.body.PATH`, `request.message.PATH`, and `request.variables.PATH` use
dotted paths ([§4.5](#45-dotted-paths-and-string-forms)) to reach nested
values — member names and 0-based array indices joined by `.`, e.g.
`{{request.body.user.role}}` or `{{request.body.items.0.id}}`. For `body`
and `message` the path MAY be omitted entirely: bare `{{request.body}}` and
`{{request.message}}` address the payload root. In running text these render
by canonical string form (a scalar renders its form; an object, array,
`null`, or absent payload renders the empty string, per
[§9.2](#92-unresolved-placeholders)); as a whole value in a native-payload
position they inject the payload itself, object or array included
([§9.4](#94-whole-value-placeholders-and-typed-output)).
(`request.variables` is path-only:
GraphQL variables are always an object, so a bare form would always render
empty.) Each
namespace reads the request model of the protocols that carry it: `params`
and `request.query` are HTTP and WebSocket data; `request.body` is HTTP data;
`request.message` is gRPC and WebSocket data; `request.metadata` is gRPC
data; `request.variables` is GraphQL data; `request.headers` is HTTP,
GraphQL, and WebSocket data. A namespace that does not apply to the
request's protocol simply resolves as absent (yielding the empty string per
[§9.2](#92-unresolved-placeholders) — no new rule).

### 9.2 Unresolved placeholders

If a placeholder cannot be resolved — the referenced parameter, header, query
key, or body path is absent — it is replaced with the **empty string**. An
implementation **MUST NOT** fail rendering because of an unresolved data
placeholder. (An *unknown faker* is different; see below.)

A placeholder that resolves to a number or boolean renders in its canonical
string form ([§4.5](#45-dotted-paths-and-string-forms)): `42` → `42`,
`1.0` → `1`, `true` → `true`. A placeholder that resolves to a value with
**no** string form — `null`, an object, or an array — is treated exactly like
an unresolved placeholder and renders as the empty string. (These string
rules govern *running text*; a whole-value placeholder is typed instead —
[§9.4](#94-whole-value-placeholders-and-typed-output).)

### 9.3 Faker

The `{{faker.CATEGORY.METHOD}}` namespace produces generated values, useful for
realistic-looking mock data. v0.2 defines the following starter set, which every
conformant implementation **MUST** support:

| Placeholder                  | Produces                                    |
| ---------------------------- | ------------------------------------------- |
| `{{faker.person.fullName}}`  | A person's full name, e.g. `Ada Lovelace`.  |
| `{{faker.internet.email}}`   | An email address, e.g. `ada.lovelace@example.com`. |
| `{{faker.string.uuid}}`      | A UUID, e.g. `3f2504e0-4f89-11d3-9a0c-0305e82c3301`. |
| `{{faker.number.int}}`       | An integer rendered as a string.            |
| `{{faker.date.recent}}`      | A recent timestamp, ISO 8601.               |

An implementation **MAY** support additional faker categories and methods beyond
this set. If a faker placeholder names a category/method the implementation does
**not** know, it **MUST** treat the document as invalid — refusing it at
**load time** per [§3.6](#36-document-validity), never silently
emitting an empty value — unlike unresolved *data* placeholders, an unknown
faker is a mistake in the mock, not missing request data.

The faker category `openmock` is **reserved**: an implementation **MUST
NOT** define methods in it. A `{{faker.openmock.*}}` placeholder is
therefore unknown on every conformant engine — which is what lets the
corpus pin unknown-faker handling portably.

Faker output is inherently non-deterministic — and there is no portable
seed: two faker libraries cannot reproduce each other's random streams, so
this specification does not pretend a shared seed mechanism exists. Instead,
a conformant implementation **MUST** offer a **conformance mode**; how it is
enabled (a flag, an environment variable, a test hook) is an implementation
concern. In conformance mode, every faker placeholder in the
[reference-value table](../conformance/README.md#faker-determinism) of the
conformance corpus **MUST** produce exactly its reference value, on every
evaluation. Outside conformance mode, faker output is unconstrained beyond
fitting the placeholder's description in the table above. The corpus is
executed in conformance mode — that, and nothing subtler, is what makes
faker cases assertable.

### 9.4 Whole-value placeholders and typed output

Templating usually produces text, but a response is native data, and a mock
often needs to echo a number *as* a number or inject an object. The rule
that enables this is deliberately syntax-free — the shape of the value
carries the meaning, as everywhere in this format:

> When a templatable value in a **native-payload position** consists of
> **exactly one placeholder** — the entire value is `{{ … }}`, with no other
> character before or after it — the rendered result is the resolved value's
> **native type**, not its string form.

- **Native-payload positions** are the ones whose output is native YAML/JSON
  data: HTTP `response.body`; gRPC `response.message` and `response.messages`;
  GraphQL `response.data` and `response.errors`; WebSocket `response.messages`.
- The other templatable positions are **wire strings** and are **always**
  rendered as strings, even as a whole value: HTTP `response.headers`, gRPC
  `response.metadata`/`trailers`/`error`, and WebSocket `close.reason`. A
  header is a string, so `X-Count: "{{request.body.count}}"` yields the
  string `"42"`.

In a native-payload position, a whole-value placeholder resolves to:

| Resolved value        | Injected as                                          |
| --------------------- | ---------------------------------------------------- |
| string                | that string                                          |
| number                | that JSON number (`42`, not `"42"`)                  |
| boolean               | that JSON boolean                                    |
| object / array        | that object / array, injected as-is                  |
| `null` or **absent**  | the **empty string** `""` (the [§9.2](#92-unresolved-placeholders) rule is unchanged; to emit a JSON `null`, write `null` literally in the body) |

Anything else — surrounding text, or two or more placeholders in one value —
makes the value a **string**, with each placeholder rendered by its canonical
string form ([§9.2](#92-unresolved-placeholders)). So
`id: "{{request.body.id}}"` injects the native value, while
`id: "order-{{request.body.id}}"` produces a string.

```yaml
# request body: { "count": 3, "active": true, "meta": { "src": "web" } }
response:
  body:
    count: "{{request.body.count}}"     # → 3        (JSON number)
    active: "{{request.body.active}}"   # → true     (JSON boolean)
    meta: "{{request.body.meta}}"       # → {"src":"web"}  (object injected)
    label: "id-{{request.body.count}}"  # → "id-3"   (mixed text → string)
```

Typed output is a **rendering** concept only. Matching is unaffected: facet
values are always strings and compare by canonical string form
([§6.1](#61-when)).

### 9.5 Literal text and escaping

A placeholder expression may be a **quoted string literal** — single or
double quotes — which renders that literal text verbatim. This is how a
response emits a literal `{{` or `}}` (which would otherwise open or close a
placeholder), following the same convention as Go text/template and Helm:

```yaml
body:
  note: '{{ "{{" }}not-a-placeholder{{ "}}" }}'   # → "{{not-a-placeholder}}"
  greeting: '{{ "hello" }}'                        # → "hello"
```

When scanning a value for the closing `}}`, an implementation **MUST** honour
quotes: a `}}` inside a quoted literal is literal text, not the terminator.
A quoted literal is a string, so as a whole value
([§9.4](#94-whole-value-placeholders-and-typed-output)) it yields a string.

## 10. Error and fallback responses

When OpenMock itself must answer (because the mock does not), it returns a
synthetic response with a small, machine-readable body.

### 10.1 No scenario matches

The request was routed to an operation, but no scenario matched and the
operation declared no default. For an **HTTP** operation the implementation
**MUST** respond with status **501 Not Implemented** and a body identifying the
unmatched operation:

```json
{
  "openmock": "unmatched",
  "message": "No scenario matched and no default scenario is defined.",
  "method": "POST",
  "path": "/users"
}
```

For a **gRPC** operation the implementation **MUST** respond with status
**`UNIMPLEMENTED`** and the error message
`No scenario matched and no default scenario is defined.` There is no
response message — a gRPC error carries none — so the identification travels
in **trailing metadata** ([§7.3](#73-grpc-responses)): the marker
`openmock: unmatched` plus the request's address in `openmock-service` and
`openmock-rpc`.

```json
{
  "status": "UNIMPLEMENTED",
  "error": "No scenario matched and no default scenario is defined.",
  "trailers": {
    "openmock": "unmatched",
    "openmock-service": "shop.v1.OrderService",
    "openmock-rpc": "CancelOrder"
  }
}
```

For a **GraphQL** operation the implementation **MUST** respond with an
`errors`-only response (no `data`) whose single error identifies OpenMock as
the source and names the request's operation in `extensions`:

```json
{
  "errors": [
    {
      "message": "No scenario matched and no default scenario is defined.",
      "extensions": {
        "openmock": "unmatched",
        "operationType": "mutation",
        "operationName": "CancelOrder"
      }
    }
  ]
}
```

For a **WebSocket** operation the implementation **MUST** reply on the
connection with a single synthetic message identifying the connection's
`path`, and keep the connection open:

```json
{
  "openmock": "unmatched",
  "message": "No scenario matched and no default scenario is defined.",
  "path": "/ws/orders"
}
```

### 10.2 No operation matches

No operation matched the request (the request is unrouted) — routing
selected no target server (an unknown name, or an omitted `server` field
without a sole server of the protocol to default to), or no operation in the
targeted server matched the request's address
([§8](#8-matching-algorithm) step 1).
For an **HTTP** request the implementation **MUST** respond with status
**404 Not Found** and a body identifying the request:

```json
{
  "openmock": "unrouted",
  "message": "No operation matched the request.",
  "method": "GET",
  "path": "/unknown"
}
```

For a **gRPC** request the implementation **MUST** respond with status
**`UNIMPLEMENTED`**, the error message `No operation matched the request.`,
and the same identifying **trailing metadata** as above — the marker
`openmock: unrouted` plus the request's `openmock-service` and
`openmock-rpc`:

```json
{
  "status": "UNIMPLEMENTED",
  "error": "No operation matched the request.",
  "trailers": {
    "openmock": "unrouted",
    "openmock-service": "shop.v1.PaymentService",
    "openmock-rpc": "Charge"
  }
}
```

For a **GraphQL** request the implementation **MUST** respond with an
`errors`-only response (no `data`), naming the request's operation in
`extensions`:

```json
{
  "errors": [
    {
      "message": "No operation matched the request.",
      "extensions": {
        "openmock": "unrouted",
        "operationType": "mutation",
        "operationName": "GetOrder"
      }
    }
  ]
}
```

For a **WebSocket** connection whose path matches no operation, the
implementation **MUST** refuse the connection at establishment rather than
accept it ([§5.9](#59-websocket-route-resolution)); no message-level
exchange ever begins. Over an HTTP-upgrade transport this is the **404**
synthetic above, sent instead of completing the upgrade, identifying the
request by `path`:

```json
{
  "openmock": "unrouted",
  "message": "No operation matched the request.",
  "path": "/ws/unknown"
}
```

These synthetic responses distinguish "this mock has no answer for that request"
from an author-declared error response (which is just a scenario with a 4xx/5xx
HTTP `status`, a non-OK gRPC `status`, a declared GraphQL `errors` list, or a
WebSocket reply/`close` shaped as an error).
The `extensions.openmock` marker (`unmatched` / `unrouted`) makes the
distinction machine-readable where GraphQL has no out-of-band status to carry
it.

Every synthetic identifies the request that provoked it, so a captured
response is self-describing without the request beside it: the `openmock`
marker plus the request's address — `method` + `path` for HTTP, `path` for
WebSocket, `openmock-service` + `openmock-rpc` (trailing metadata) for gRPC,
`operationType` + `operationName` (`extensions`) for GraphQL.

## 11. Specification extensions

Any key whose name begins with `x-` is a **specification extension**: a place
for implementations to attach data or behaviour beyond this specification,
without breaking portability.

Extension keys are permitted on these objects:

- the document root,
- a server object,
- an operation object,
- a scenario object,
- a response object.

Rules:

1. An implementation that does not recognise an `x-` key **MUST ignore it**.
   Ignoring every `x-` key in a document MUST still yield a well-formed
   document that resolves requests per [§8](#8-matching-algorithm).
2. An extension **MUST NOT** change the meaning of any standard field. A
   document whose standard fields only make sense when an extension is
   interpreted is not a conformant OpenMock document.
3. An implementation **MAY** define behaviour for the `x-` keys it recognises
   (for example, an engine that executes a script referenced by an `x-` key).
   Such behaviour is out of scope for this specification and for the
   conformance corpus, which covers standard fields only.
4. Extension keys **SHOULD** be namespaced by their vendor or project,
   e.g. `x-acme-latency-profile`, to avoid collisions. Names beginning with
   `x-openmock-` are reserved for experiments run by the OpenMock project
   itself.

```yaml
openmock: 0.2.0
x-acme-team: payments          # ignored by engines that don't know it
servers:
  - name: payments-api
    type: http
    x-acme-tier: critical      # extensions are permitted on servers too
    operations:
      - method: GET
        path: /health
        x-acme-monitor: true
        scenarios:
          - name: healthy
            response:
              status: 200
              body:
                status: ok
```

An engine that recognises none of the `x-acme-*` keys serves this mock exactly
as if they were absent.

### 11.1 Example: gRPC engine behaviour (non-normative)

OpenMock's gRPC support is deliberately **proto-free** ([§4.2](#42-grpc-requests)):
a document is serveable without any `.proto` file, and when a server does
carry its protobuf schema it does so through the standard `descriptorSet`
field ([§3.4](#34-grpc-servers-descriptorset)) — descriptor attachment is **not** extension
territory, precisely so that the same document ports across engines.

Extensions remain the place for engine behaviour *around* the schema — knobs
this specification does not define, for example:

```yaml
servers:
  - name: orders-grpc
    type: grpc
    descriptorSet: ./descriptors/shop.binpb   # standard (§3.4)
    x-acme-reflection: false        # engine-specific: don't serve reflection
    operations:
      - service: shop.v1.OrderService
        rpc: GetOrder
        type: unary
        scenarios:
          - ...
```

Per the rules above, an engine that ignores `x-acme-reflection` MUST still
serve the mock from the standard fields alone.

## 12. Conformance

The [`/conformance`](../conformance) corpus is the **normative source of truth**
for behaviour. Each case is a directory with `input.yml` (the document),
`request.json` (a normalized request), and `expected.json` (the response an
implementation must produce) — or, for stateful behaviour, a `steps.json`
sequence, or, for invalid documents, an `invalid.json` marker: the
implementation must refuse to load that case's `input.yml`
([§3.6](#36-document-validity)). An implementation is **conformant** when it
produces the expected outcome for every case. Where this prose and the corpus
disagree, the corpus is authoritative and the prose is in error.

## 13. Glossary

| Term            | Meaning                                                            |
| --------------- | ----------------------------------------------------------------- |
| **Document**    | One OpenMock YAML file.                                            |
| **Invalid document** | A document violating any requirement of this specification; refused whole at load time, never partially served or lazily failed ([§3.6](#36-document-validity)). |
| **Server**      | A named group of operations of one protocol — one mock service. Declared in the top-level `servers` list; addressed by requests through its unique `name`; carries its own protocol settings (`descriptorSet`, `schema`) and call counters ([§3.3](#33-servers-required)). |
| **Operation**   | An entry in a server's `operations` list: an addressable route and its scenarios — `method` + `path` (HTTP), `service` + `rpc` (gRPC), `operationType` + `operationName` (GraphQL), or `path` (WebSocket). |
| **Call type**   | A gRPC operation's declared shape: `unary` or `server-streaming`. Never inferred from responses. |
| **Operation name** | A GraphQL request's client-declared name (`query GetOrder { … }` → `GetOrder`); what GraphQL operations route on. Case-sensitive. |
| **Path parameter** | A `{name}` segment in a `path`, capturing one non-empty path segment as its percent-decoded value ([§5.2](#52-path-and-path-parameters)). |
| **Scenario**    | A named `when` + `response` pair within an operation.             |
| **Facet**       | One constraint category inside `when` (`params`/`query`/`headers`/`body` for HTTP, `metadata`/`message` for gRPC, `variables`/`headers` for GraphQL, `params`/`query`/`headers`/`message` for WebSocket, `calls` for all). |
| **Dotted path** | The `items.0.id` syntax addressing values inside `body`/`message`/`variables`: non-empty segments joined by `.`, where a segment names an object member or 0-based-indexes an array. Every `.` separates; failed resolution is *absent* ([§4.5](#45-dotted-paths-and-string-forms)). |
| **Matcher**     | An object facet value standing in for exact equality: `{exists: true/false}` asserts presence/absence; `{pattern: "…"}` matches the entire canonical string form against an RE2 pattern ([§6.1](#61-when)). |
| **Canonical string form** | The string a request value compares and renders as: strings unchanged, booleans `true`/`false`, numbers in shortest round-trip decimal; `null`, objects, and arrays have none ([§4.5](#45-dotted-paths-and-string-forms)). |
| **Call counter** | Per-(server, operation, concrete address) count of routed requests; matched by the `calls` facet. Per-(server, operation, connection) for WebSocket. |
| **Connection**  | One established WebSocket connection: routed once by `path`, carrying fixed `params`/`query`/`headers` and its own call counters; identified by the opaque `connection` value. |
| **Metadata**    | gRPC's header analog: key→value pairs on a request or response; keys match case-insensitively; repeated request keys join with `", "` ([§4.6](#46-multi-valued-fields)). On responses, `metadata` is the **initial** set (headers) and `trailers` the **trailing** set, sent with the status ([§7.3](#73-grpc-responses)). |
| **Message**     | A gRPC request or response payload, written as native YAML per the proto3 JSON mapping; or a WebSocket inbound/reply payload, written as native YAML. |
| **Variables**   | A GraphQL request's variables object; matched by the `variables` facet and read by `{{request.variables.PATH}}`. |
| **Partial response** | A GraphQL response carrying both `data` and `errors`.         |
| **Default scenario** | A scenario with no `when`; always matches; the fallback.     |
| **First-match-wins** | Scenarios are tried in order; the first match is used.        |
| **Normalized request** | The transport-agnostic request model in [§4](#4-the-request-model). |
| **Templating placeholder** | A `{{ … }}` expression substituted during rendering.    |

## 14. Security considerations

An OpenMock document is data, and resolving a request against it
([§8](#8-matching-algorithm)) executes no author-supplied code: templating
substitutes values, never runs logic, and there is no scripting, proxying,
or fallthrough ([§1 Non-goals](#1-status-and-scope)). Two areas nonetheless
warrant care when an implementation serves **untrusted** documents.

**File-path resolution.** The only fields that name external files are the
gRPC server's optional `descriptorSet`
([§3.4](#34-grpc-servers-descriptorset)) and the GraphQL server's optional
`schema` ([§3.5](#35-graphql-servers-schema)), each a path *resolved
relative to the document*. An implementation that loads these from untrusted
documents **SHOULD** confine resolution to the document's own directory —
rejecting a path that escapes it via `..` traversal or an absolute path —
and **SHOULD NOT** dereference a remote URL implicitly. Because both
attachments are optional and never change what a document means
([§3.4](#34-grpc-servers-descriptorset)/[§3.5](#35-graphql-servers-schema)), an implementation
**MAY** decline to load them at all and still serve the document.

**Denial of service.** Facet `pattern` matchers are **RE2**
([§6.1](#61-when)), which runs in guaranteed linear time — a document cannot
smuggle in a catastrophically backtracking expression. `delay`
([§7.2](#72-delay)) is author-controlled latency; an implementation serving
untrusted documents **MAY** cap it. Other resource limits (document size,
request rate, connection count) are transport concerns, exactly as ports and
TLS are ([§1](#1-status-and-scope)).
