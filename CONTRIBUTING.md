# Contributing to DocShare

Thanks for taking the time to contribute. This is a small, focused project — keep changes tight and well-scoped.

## Getting started

1. Fork and clone the repo.
2. Install dependencies: `pnpm install`
3. Copy `cp .env.example .env` and fill in at least `DATABASE_URL` and `JWT_SECRET`.
4. Push the schema: `pnpm db:push`
5. Run the dev server: `pnpm dev`

## Before you open a PR

- `pnpm check` — TypeScript must pass with no errors.
- `pnpm test` — the Vitest suite must be green.
- `pnpm format` — run Prettier so the diff stays clean.

## Guidelines

- Keep PRs small and single-purpose. One change per PR.
- Match the existing code style; don't reformat unrelated files.
- Add or update tests for behavior changes (see `server/*.test.ts`).
- Don't commit secrets. `.env` is gitignored — keep it that way.
- For new env vars, document them in `.env.example`.
- For schema changes, generate a migration via `pnpm db:push` and commit the generated SQL under `drizzle/`.

## Reporting bugs

Open an issue with steps to reproduce, what you expected, and what happened. Include the storage/auth provider you're running and any relevant logs.

## License

By contributing, you agree that your contributions are licensed under the MIT License.
