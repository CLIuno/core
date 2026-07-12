# The CLIuno shared API contract

Every backend template serves this exact surface; every frontend template consumes it.
The **frontends define the contract** — their API layers are the reference implementation.

## Conventions

- Base URL: `http://localhost:3000/api/v1` (frontends read it from `VITE_BACKEND_URL`,
  `NUXT_PUBLIC_API_BASE`, or Angular's `environment.apiUrl`).
- Auth: `Authorization: Bearer <token>` from login's `data.token`.
- Request keys are **camelCase** where the frontends send them (`usernameOrEmail`,
  `refreshToken`, `oldPassword`, `newPassword`, `otp`); resource fields are snake_case
  (`first_name`, `password_confirmation`). Backends may additionally accept snake_case
  aliases for their own tests, but must accept the camelCase form.
- Every response: `{ status, message?, data }` — the `data` keys below are what frontends
  destructure, so they are load-bearing.
- Errors: meaningful HTTP status + `{ status: 'error'|'warning', message }`.
- `GET /users` is **authenticated, not admin** (the users page is a normal-user page).
  `PATCH/DELETE /users/:id` may be admin-gated (403 for non-admins is a valid contract).

## Auth

| Endpoint                       | Body                                                                             | Response `data`                              |
| ------------------------------ | -------------------------------------------------------------------------------- | -------------------------------------------- |
| `POST /auth/register`          | `first_name, last_name, username, email, phone, password, password_confirmation` | user info (token optional)                   |
| `POST /auth/login`             | `usernameOrEmail, password`                                                      | **`token`**, `refreshToken`, user fields     |
| `POST /auth/logout`            | — (Bearer)                                                                       | —                                            |
| `POST /auth/check-token`       | `token` (Bearer)                                                                 | —                                            |
| `POST /auth/refresh-token`     | `refreshToken`                                                                   | **`token`**, `refreshToken`                  |
| `POST /auth/change-password`   | `oldPassword, newPassword` (Bearer)                                              | — (must verify old password)                 |
| `POST /auth/forgot-password`   | `email`                                                                          | — (store reset token on the user; email it)  |
| `POST /auth/reset-password`    | `password, token`                                                                | — (look up the user **by token**)            |
| `POST /auth/send-verify-email` | — (Bearer)                                                                       | — (store verify token on the user; email it) |
| `POST /auth/verify-email`      | `token`                                                                          | — (look up the user **by token**)            |
| `POST /auth/otp/generate`      | — (Bearer)                                                                       | **`secret`**, `otpauth_url`                  |
| `POST /auth/otp/verify`        | `otp` (Bearer)                                                                   | — (enables OTP; RFC 6238 TOTP, sha1/6/30s)   |
| `POST /auth/otp/validate`      | `otp` (Bearer)                                                                   | —                                            |
| `POST /auth/otp/disable`       | — (Bearer)                                                                       | — (clears the secret)                        |

OTP endpoints act on the **authenticated user** — never a usernameOrEmail body.
One-time tokens (reset/verify) are stored on the user row so lookup-by-token works;
registration also stores the verify token it emails.

## Users

| Endpoint                                  | Response `data`                         |
| ----------------------------------------- | --------------------------------------- |
| `GET /users`                              | `users: [...]`                          |
| `GET /users/current` · `PATCH` · `DELETE` | `user: {...}` (current user via Bearer) |
| `GET /users/username/:username`           | `user`                                  |
| `GET /users/:id`                          | `user`                                  |
| `PATCH /users/:id` · `DELETE /users/:id`  | `user` (admin-gated OK)                 |
| `GET /users/:id/posts`                    | `posts: [...]`                          |
| `GET /users/:id/roles`                    | `role`                                  |

## Todos

`GET /todos` → `data.todos` · `GET /todos/current-user` → `data.todos` ·
`POST /todos {title, description?}` → created todo (id reachable in `data`) ·
`GET/PATCH/DELETE /todos/:id` → `data.todo` · `PATCH /todos/:id/toggle` → `data.todo`.
Creates attach the **authenticated user as owner**.

## Posts & comments

`GET /posts` → `data.posts` (include user + comments) · `GET /posts/current-user` →
`data.posts` · `POST /posts {title, content}` → created post (author = Bearer user;
`imageUrl` optional) · `GET/PATCH/DELETE /posts/:id` → `data.post` ·
`GET /posts/:id/user` → `data.user` · comments nest under posts:
`GET|POST /posts/:id/comments` → `data.comments`/`data.comment`,
`PATCH|DELETE /posts/:id/comments/:commentId`.

## Follows

All keyed by the **target** user id, acting as the Bearer user:
`POST /follows/:id/follow` · `DELETE /follows/:id/follow` ·
`GET /follows/:id/followers` → `data.followers` ·
`GET /follows/:id/following` → `data.following` ·
`GET /follows/:id/is-following` → `data.isFollowing` (camelCase key).

## Roles (fresh-install rule)

Registration assigns the `user` role and **creates it on first use**
(`firstOrCreate` / `get_or_create`) — a fresh clone must register successfully with an
empty database, no seed step required.
