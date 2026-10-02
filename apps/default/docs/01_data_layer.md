# 01 - Data layer

A Genesis app reads and writes its Taskade project rows through the data
gateway at relative `/api/taskade/*` paths. The Director proxy injects the
gateway token server-side; the app never handles credentials. Always use the
typed helpers - never hand-roll gateway URLs.

## Project rows: `@/lib/genesis-data`

```ts
import {
  getNodes,
  createNode,
  updateNode,
  deleteNode,
  getFieldValue,
  getFieldNumber,
  getTitle,
} from '@/lib/genesis-data';

const rows = await getNodes(PROJECT_ID); // GenesisNode[]
const title = getTitle(rows[0], 'Name', 'Title') ?? 'Untitled'; // string | null
const status = getFieldValue(rows[0], 'Status'); // string | null
const score = getFieldNumber(rows[0], 'Score') ?? 0; // number, never NaN
await createNode(PROJECT_ID, { Name: 'Maria', Status: 'New', parentId: rows[0].id });
await updateNode(PROJECT_ID, rows[0].id, { Status: 'Contacted' }); // partial update
await deleteNode(PROJECT_ID, rows[0].id);
```

`GenesisNode`: `{ id: string; fieldValues: Record<string, string>; parentId: string | null; content?: string }`.

- `getNodes` returns ALL rows as one FLAT array. In a flat database (the common
  case) every row has `parentId === null` - use the array as-is. NEVER filter by
  `parentId` to find data rows: `rows.filter((r) => r.parentId !== null)` returns
  an empty list and renders a blank app.
- Read fields with `getFieldValue(row, ...keys)` / `getFieldNumber(row, ...keys)`,
  not by indexing `fieldValues` directly. They fall back across multiple keys
  (pass display name first, then field path) and `getFieldNumber` coerces safely
  (null, never `NaN`, for missing or non-numeric values).
- **Displaying a row's name/title? Use `getTitle(row, ...keys)`.** It reads the
  named title/name field first and falls back to the row's node text (`content`)
  only when no such field exists - so a card shows a real label instead of
  "Untitled" even if the name was seeded into node text. Still put the name in a
  real field: `content` is a last-resort display fallback, NOT queryable data -
  never filter or sort on it (it is often absent).

## Field keys: display name vs field path (the compat gotcha)

Each field value in `fieldValues` is emitted under BOTH keys when possible:

| Key form     | Example              | When present                                                                                     |
| ------------ | -------------------- | ------------------------------------------------------------------------------------------------ |
| Field path   | `/attributes/@statu` | always (stable, internal)                                                                        |
| Display name | `Status`             | only when the name is non-empty, UNIQUE across the project's fields, and not itself a field path |

Consequences:

- Two columns both named `Status` = ambiguous: the display-name key disappears
  and only the field paths remain. Reads of `fieldValues['Status']` silently
  return `undefined`.
- Writes accept either key form. Matching is exact (case- and
  whitespace-sensitive). Unknown or ambiguous keys are SILENTLY DROPPED, not
  errored - a misspelled field name looks like a successful write that changed
  nothing.
- Prefer display names for readability; keep project field names unique.
- `getFieldValue(row, '@statu')` reads the field path `/attributes/@statu`.
  A row has no bare `@statu` key, so a direct `fieldValues['@statu']` read
  returns `undefined`.

## Automations: `@/lib/genesis-flows`

```ts
import { submitForm, runFlow, getFlowRuns } from '@/lib/genesis-flows';

await submitForm(FLOW_ID, { file, title: file.name }); // FORM-trigger flow (side effect only; a file upload is the one row it may save, see below)
await runFlow(FLOW_ID, { orderId: '789' }); // WEBHOOK/MANUAL-trigger flow
const { runs } = await getFlowRuns(FLOW_ID, { limit: 5 }); // newest first: { id, status, createdAt, updatedAt }
```

Read run history through `getFlowRuns` only. Do not build the gateway URL by
hand: the helper is the supported contract (id encoding, paging cursor,
response envelope) and a raw fetch is not. Runs carry id, status
(`completed | failed | running | filtered`) and timestamps only; step detail
and error bodies are not readable from an app.

`submitForm` returns `{ flowRunId?: string; ignoredKeys: string[] }`. A key in
`ignoredKeys` matched no form input, so that answer was not saved: treat a
non-empty list as a failed save. `runFlow` returns `{ flowRunId?: string }`; `getFlowRuns` returns
`{ runs, nextCursor }` (pass `nextCursor` back as `cursor` for the next page). A WEBHOOK flow ending in an "HTTP
response" action returns that body synchronously (then `flowRunId` is
undefined); a non-2xx or non-JSON synchronous body throws.

### Intake forms: `createNode` only, never both

A contact / lead / survey submit persists with `createNode`, NOT `submitForm`.
Routing intake through a flow makes the submission depend on that flow being
enabled (a disabled flow returns 404 and the data is silently lost).

**One submission writes exactly one row.** Never call `createNode` and
`submitForm` for the same submit. If the flow behind the form also has an Add
Task step, every submission lands twice and the duplicate pair disagrees on
whichever fields only one writer sets.

A row that carries an uploaded file: when the build instructions name
`uploadFile` (from `@/lib/genesis-data`), upload each file with it and write
the row once with `createNode`, with each returned `url` in its field. Each
file then goes in its own request, and no flow is in the save path. Without
those instructions, the one exception applies: pass the `File` to
`submitForm` and let the flow's Add Task step save the row with the
`https://files.taskade.com/...` URL it receives; the page does not also call
`createNode` for that submit. A field holds that URL, never the file bytes
(no base64 `data:` URLs in a row).

```ts
// WRONG - two writers, two rows per submit
await createNode(INQUIRIES_ID, { Name: name, Email: email });
try {
  await submitForm(INQUIRY_FLOW_ID, { name, email });
} catch {} // the flow adds the task again

// RIGHT - the page is the only writer
await createNode(INQUIRIES_ID, { Name: name, Email: email, Status: 'New' });
```

Notifications and side effects belong in a SEPARATE flow that triggers on the
project write (`task.added` on that project), so the form still persists when
the automation is off.

Hand-authored forms should carry the QA selector contract: `data-genesis-form`
on the `<form>` element, `data-genesis-field="<field name>"` on each field
wrapper, `data-genesis-submit` on the primary submit button, and
`data-genesis-next` on the step-advance button of a multi-step form, so
platform QA tooling can drive them. The shipped blocks (`LeadCaptureForm`)
already do.

### Uploading a file (PDF / photo / document) to a flow

To let a flow read an uploaded document, pass the `File` object directly as a
value. It is uploaded to Taskade media and the flow input receives a real
`https://files.taskade.com/...` URL - exactly what a `Convert File to Text`
(`pdf.convertToText`) flow step needs to OCR it.

```ts
// <input type="file" accept="application/pdf,image/*" onChange={onPick} />
async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0];
  if (file == null) return;
  await submitForm(PROCESS_DOC_FLOW_ID, { file, title: file.name }); // field key = the flow's file input
}
```

NEVER read the file into a base64 `data:` URL (e.g. `FileReader.readAsDataURL`)
and send that string - the flow's media/OCR steps reject a `data:` URL as
"Invalid URL" and nothing is read. Always pass the raw `File`; `submitForm` /
`runFlow` switch to `multipart/form-data` automatically when a value is a file.
The file's field-name key must match the flow input the media step reads.

## Per-user data

- Wrapped in `<GenesisAuth>` (see `HOW_TO_USE.md`), the signed-in end-user's
  identity is attached to gateway calls automatically (`gateway-auth.tsx`
  patches fetch/XHR for same-origin gateway URLs only). Do not set
  Authorization headers yourself.
- The gateway delegates per-row authorization to the app by default. Client
  code (e.g. `filterByOwner`) only changes what is RENDERED - the full row set
  still reaches the browser. Real per-user privacy requires gateway row
  scoping, enabled by the Taskade team; with it ON, `getNodes` already returns
  only the verified user's rows.

## Third-party APIs with keys: `GenesisClient.proxy()`

Never embed an API key in app code. The proxy resolves a named Workspace
Secret server-side and substitutes the literal `{{secret}}` placeholder:

```ts
import { GenesisClient } from '@taskade/genesis-client';

const taskade = new GenesisClient({ spaceId: SPACE_ID });
const res = await taskade.proxy({
  secretAlias: 'openai', // key name saved in Space Settings -> Secrets
  url: 'https://api.openai.com/v1/chat/completions',
  method: 'POST',
  headers: { Authorization: 'Bearer {{secret}}' },
  body: { model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'Hi' }] },
});
const data = await res.json();
```

Returns a normal `Response` for both 2xx and non-2xx upstream statuses; branch
on `res.ok`. Use the proxy for any keyed third-party API; skip it for public
open-data endpoints and for Taskade-internal calls (those use the helpers
above). Tell the user to add the secret under Space Settings -> Secrets with
the exact `secretAlias` name before the feature can work.
