# Firebase Shared List Schema (v2)

This document describes legacy shared codes (v2) and the separate authenticated shopping household namespace. Legacy codes remain compatible.

## Authenticated shopping household (Spark)

```text
householdAccess/{householdId}/{uid}: true
householdUsers/{uid}/householdId: string
households/{householdId}
  name: string
  records/{listId}
    list: JSON string (working list, tasks and photos; max 7,000,000 characters)
    revision: integer, incremented once per changed transaction
    closedAt?: timestamp
    deletedAt?: timestamp
    deletedBy?: string
    purchase?
      data: JSON string (purchase identity and item outcomes, no photos; max 1,500,000 characters)
      revision: integer, initially 1; correction increments by 1
      occurredAt: timestamp
      mode: complete | quick
      deletedAt?: timestamp
  preferences/{productKey}: { categoryId?, blocked?, updatedAt, updatedBy }
  preferences/_settings: { jevEnabled, updatedAt, updatedBy }
```

The administrator provisions exactly the two authorized UIDs and their profile links. Client writes to ACL/profile mappings are denied. A user reads only their own profile; only members read a household and its ACL. There are no client-created households, invitation tokens, Firebase Functions or Admin SDK credentials.

Every list is updated through a client transaction on its own record. The semantic snapshot is checked inside the retried transaction. Closing a list and creating its purchase happen atomically. Repeating a close returns the existing purchase. Closed list content is immutable byte-for-byte; only its deletion tombstone can be added. Purchase correction increments its own revision and the record revision. Physical record deletion, reopening and removing a closed record's purchase are denied.

The rules validate access, allowed envelope fields, string sizes, revision increments, dates and the closed/purchase relationship. They cannot parse the inner JSON: its item schema is validated by the client, and both authorized people are trusted coauthors. Malformed inner content is rejected by the reader with a data error. This design is for a private household, not adversarial member auditing. Empty arrays remain intact in the JSON strings.

Inside `list`: id, purchaseId (= listId), householdId, title, kind, sourceRef?, metadata timestamps, tasks. Each task retains text/completion/deletion/photo versions and shopping metadata (productKey, name, categoryId, source, sourceText, quantity/unit when present). Local UI ordering and pending flags are omitted. The purchase JSON contains id/listId/sourceRef, kind/title and items with bought/missing/pending outcomes. Its envelope is authoritative for mode, date, revision and deletion.

The optional Cloudflare Worker uses the user's Firebase ID token for read-only REST access to the ACL and Jev preference. It has no administrative access. No Jev API secret is stored in this database or frontend.

See [shopping.md](shopping.md) for implementation and [PREPARAR-CHROME.md](PREPARAR-CHROME.md) for the later configuration session. The shape below applies **only** to legacy `sharedLists/{code}`.

## Realtime Database Path

```text
sharedLists/{code}
```

- `{code}`: 6-character share code (`A-Z`, `0-9`)

## Current Stored Shape

```text
sharedLists
  {code}
    meta
      title: string
      createdAt: number
      updatedAt: number
      updatedBy: string
      schemaVersion: 2
    tasks
      {taskId}
        id: string
        text: string
        done: boolean
        notHave: boolean
        createdAt: number
        updatedAt: number
        updatedBy: string
        deletedAt: number | null
        deletedBy: string | null
        textUpdatedAt: number
        textUpdatedBy: string
        doneUpdatedAt: number
        doneUpdatedBy: string
        notHaveUpdatedAt: number
        notHaveUpdatedBy: string
        photos
          {photoId}
            id: string
            dataUrl: string | null
            createdAt: number
            updatedAt: number
            updatedBy: string
            deletedAt: number | null
            deletedBy: string | null
```

## Notes

- `taskId` and `photoId` are stable remote IDs.
- The client uses `updatedAt/updatedBy` for deterministic conflict resolution.
- `textUpdatedAt/textUpdatedBy` and `doneUpdatedAt/doneUpdatedBy` allow concurrent rename and toggle operations to merge without losing unrelated changes.
- Deletes use tombstones (`deletedAt` / `deletedBy`) so tasks and photos do not reappear after sync or reload.
- Manual order and local visual groups are not part of the shared schema.

## Compatibility

- The client still reads legacy v1 payloads:

```text
sharedLists/{code}
  title: string
  updatedAt: number
  tasks: Task[]
```

- When a v1 payload is read, the client normalizes it to v2, generates stable IDs/metadata, and writes the migrated structure back automatically.
- This keeps old share codes working without a manual migration step.

## Client Limits

- Max photos per task in the shared payload: `4`
- Max `dataUrl` length per shared photo: `400000` characters
- Max serialized payload target for a full snapshot write: `7 MB`
- If a full snapshot exceeds the payload target, the client trims the largest photo entries first

## Example

```json
{
  "sharedLists": {
    "A1B2C3": {
      "meta": {
        "title": "Weekend Chores",
        "createdAt": 1773206400000,
        "updatedAt": 1773206400000,
        "updatedBy": "client_ab12cd",
        "schemaVersion": 2
      },
      "tasks": {
        "t_lz2v0c_4k9m1p": {
          "id": "t_lz2v0c_4k9m1p",
          "text": "Clean the kitchen",
          "done": false,
          "notHave": false,
          "createdAt": 1773206400000,
          "updatedAt": 1773206400000,
          "updatedBy": "client_ab12cd",
          "deletedAt": null,
          "deletedBy": null,
          "textUpdatedAt": 1773206400000,
          "textUpdatedBy": "client_ab12cd",
          "doneUpdatedAt": 1773206400000,
          "doneUpdatedBy": "client_ab12cd",
          "notHaveUpdatedAt": 1773206400000,
          "notHaveUpdatedBy": "client_ab12cd",
          "photos": {
            "p_lz2v0c_h41n7q": {
              "id": "p_lz2v0c_h41n7q",
              "dataUrl": "data:image/jpeg;base64,/9j/4AAQSk...",
              "createdAt": 1773206400000,
              "updatedAt": 1773206400000,
              "updatedBy": "client_ab12cd",
              "deletedAt": null,
              "deletedBy": null
            }
          }
        }
      }
    }
  }
}
```

## Operational Guidance

- Realtime Database Rules should validate `meta`, `tasks`, and `photos` field types.
- Read/write access should remain scoped to `sharedLists/{code}`.
- If the schema changes again, the compatibility section in this document must be updated in the same release.
