# Image upload: profile avatars and post images

Closes CLIuno-Express-template#34 ("user should be able to upload avatar image to his
profile and can upload image when he is posting"), rolled out across all 12 backend
templates and all 9 frontend templates.

## Contract addition

```
POST /api/v1/uploads/image     Bearer, multipart/form-data, field "file"
  201 { status, message, data: { url, filename } }
  400 no file / disallowed type
  401 no bearer token
  413 payload too large

GET  /uploads/<filename>       public, static, no auth, no version prefix
```

`data.url` is **absolute** (`http://localhost:3000/uploads/<uuid>.png`) so a frontend on a
different origin (Vite on `:5173`, Expo, Flutter) can use it directly as an image source
with no base-URL reconstruction. It is built from `PUBLIC_BASE_URL` when that env var is
set, otherwise from the request origin.

Attachment reuses endpoints that already exist — the upload endpoint never mutates a
resource:

- `PATCH /users/current { avatar_url }`
- `POST /posts { title, content, image_url }` (also accepts the `imageUrl` alias)

## Storage and validation

- Files land in `uploads/` at each backend repo root. The directory is created on boot,
  gitignored, and tracked with a `.gitkeep`.
- Stored filename is `<uuid>.<ext>`; the extension is derived from the detected mime type,
  never from the client-supplied filename.
- Accepted mime types: `image/png`, `image/jpeg`, `image/webp`, `image/gif`.
- Maximum size: **5 MB**.
- **No image processing.** No sharp, Pillow, or ImageMagick — 12 backends stay
  dependency-light, and resizing is not something a scaffold should decide for you.
- **Replacing an avatar does not delete the old file.** Deliberate: garbage collection of
  orphaned uploads is an application concern, not a template concern.

## Data model

Every backend gains a nullable `avatar_url` text column on the user table, included in
**every** serialized user payload: register, login, `GET /users/current`, `GET /users`,
`GET /users/:id`, `GET /users/username/:username`.

Posts already carry `image_url` in most backends. Each of the 12 is verified; the column is
added where missing, and create/update accept both `image_url` and the `imageUrl` alias.

## Frontends

All 9 frontend API layers gain two calls, restoring an identical surface:

- `uploadImage(file)` — posts multipart to `/uploads/image`
- `updateCurrentUser(data)` — `PATCH /users/current`

The second one is a pre-existing drift fix: only Next and Svelte had `updateCurrentUser`;
Vue, Solid, and Angular only had `updateUserById`; React, Nuxt, React Native, and Flutter
had neither.

UI work per frontend:

- Profile page: click the avatar to pick a file, upload it, PATCH `avatar_url`, refresh.
- Every avatar render site (navbar, users list, user detail, post detail) shows
  `avatar_url` as the image with the existing initials block as fallback.
- Post composer: image picker with preview; post cards render `image_url`.

Mobile picks up native dependencies: `expo-image-picker` (React Native), `image_picker`
(Flutter).

## Verification

A new matrix flow step, placed after `PATCH /users/current`:

1. Generate a tiny valid PNG in-script.
2. `POST /uploads/image` as multipart using native `FormData`/`Blob`, asserted with
   `okShape('data.url')`.
3. `GET` the returned absolute URL to prove static serving actually works.
4. `PATCH /users/current { avatar_url }`, then assert the value round-trips on
   `GET /users/current`.

The post-create step gains an `image_url`. Each backend's own test suite gains an upload
test. Native linters stay clean. The full matrix must exit 0 at 108/108.

## Rollout order

1. Contract doc and matrix step first, so the board goes red for a known reason.
2. Express — reference implementation, closes #34.
3. The remaining 11 backends, verifying one column at a time.
4. The 9 frontends.
5. Full matrix green.
