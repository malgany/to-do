# Firebase Shared List Schema

This document describes the Firebase Realtime Database structure used to store shared lists and their associated task photos. It also captures media compression requirements, Firebase configuration recommendations, and migration guidance for existing data.

## Realtime Database Structure

All shared lists live under the `sharedLists/{code}` path, where `{code}` is the share identifier generated for the list. A list entry contains metadata about the list and the collection of tasks it tracks.

### Schema Overview

```
sharedLists
  └── {code}
      ├── title: string
      ├── createdAt: string (ISO 8601 timestamp)
      ├── updatedAt: string (ISO 8601 timestamp)
      └── tasks: Task[]
```

Each task can now include zero or more associated photos.

```
Task
  ├── id: string
  ├── title: string
  ├── description: string
  ├── completed: boolean
  ├── dueDate: string | null (ISO 8601 timestamp)
  └── photos: Photo[]

Photo
  ├── id: string
  ├── dataUrl: string (Base64-encoded image data)
  ├── createdAt: string (ISO 8601 timestamp)
  ├── mimeType: string (e.g., "image/jpeg")
  ├── width: number (pixels)
  └── height: number (pixels)
```

### Example Document

```json
{
  "sharedLists": {
    "abc123": {
      "title": "Weekend Chores",
      "createdAt": "2024-05-04T16:12:00.000Z",
      "updatedAt": "2024-05-05T09:45:00.000Z",
      "tasks": [
        {
          "id": "task-1",
          "title": "Clean the kitchen",
          "description": "Wipe counters and mop the floor",
          "completed": false,
          "dueDate": "2024-05-06T12:00:00.000Z",
          "photos": [
            {
              "id": "photo-1",
              "dataUrl": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ...",
              "createdAt": "2024-05-05T08:30:00.000Z",
              "mimeType": "image/jpeg",
              "width": 1280,
              "height": 720
            }
          ]
        },
        {
          "id": "task-2",
          "title": "Buy groceries",
          "description": "Milk, eggs, bread",
          "completed": true,
          "dueDate": null,
          "photos": []
        }
      ]
    }
  }
}
```

## Photo Compression Requirements

To keep storage and bandwidth costs manageable, compress every task photo before uploading it to Firebase Storage. The target is to limit each stored image to approximately **200 KB**. Recommended steps:

- Resize large images to a sensible maximum dimension (e.g., 1280px on the longest edge) prior to encoding.
- Use a lossy format such as JPEG with a quality setting tuned to stay under the 200 KB threshold.
- Strip metadata (EXIF, GPS) before upload to minimize payload size.
- Validate the final encoded `dataUrl` or Storage object size and reprocess if it exceeds the limit.

## Firebase Configuration Recommendations

- **Realtime Database Rules**: Ensure only authorized clients can read/write `sharedLists/{code}` by validating the share code and user permissions in security rules. Enforce that `photos` is always an array of objects with the expected fields and value types.
- **Storage Rules**: Restrict write access to the bucket folder used for task photos. Validate MIME types to allow only supported image formats (JPEG/PNG/WebP) and enforce the 200 KB size limit via rule checks when possible.
- **Storage Structure**: Store task photos under a deterministic path such as `task-photos/{code}/{taskId}/{photoId}.jpg` to simplify cleanup and sharing.
- **Realtime Database Performance**: Enable server-side indexing on frequently queried fields such as `updatedAt` if you support sorted queries.

## Migration Guidance

When rolling out photo support to existing shared lists, update each task document to ensure the `photos` array is present:

1. Iterate over every list in `sharedLists` and each nested task.
2. If a task is missing the `photos` property, initialize it with an empty array (`[]`).
3. Optionally run a backfill script that uploads any legacy photo attachments to Storage and populates the new photo objects with metadata.
4. After migration, deploy updated validation rules so older clients without `photos` support will receive informative errors instead of writing malformed data.

These steps ensure older lists remain compatible while enabling the richer task media experience.
