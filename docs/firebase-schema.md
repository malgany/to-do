# Firebase Shared List Schema (v2)

This document reflects the current shared-list format written and read by the app.

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
      updatedAt: number
      updatedBy: string
      schemaVersion: 2
    tasks
      {taskId}
        id: string
        text: string
        done: boolean
        createdAt: number
        updatedAt: number
        updatedBy: string
        deletedAt: number | null
        deletedBy: string | null
        textUpdatedAt: number
        textUpdatedBy: string
        doneUpdatedAt: number
        doneUpdatedBy: string
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
        "updatedAt": 1773206400000,
        "updatedBy": "client_ab12cd",
        "schemaVersion": 2
      },
      "tasks": {
        "t_lz2v0c_4k9m1p": {
          "id": "t_lz2v0c_4k9m1p",
          "text": "Clean the kitchen",
          "done": false,
          "createdAt": 1773206400000,
          "updatedAt": 1773206400000,
          "updatedBy": "client_ab12cd",
          "deletedAt": null,
          "deletedBy": null,
          "textUpdatedAt": 1773206400000,
          "textUpdatedBy": "client_ab12cd",
          "doneUpdatedAt": 1773206400000,
          "doneUpdatedBy": "client_ab12cd",
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
