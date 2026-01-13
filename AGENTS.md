# Repository Guidelines

## Project Structure & Module Organization
- Root: shared configs, `scripts/` utilities (`doctor` checks), Husky hooks in `.husky/`.
- `frontend/`: React + Vite + Tailwind (TypeScript). Entry files `src/main.tsx`, `src/App.tsx`; routing/layouts under `src/pages/` and `src/layouts/`; state in `src/store/`; shared components in `src/components/`.
- `backend/` and `wa-gateway/`: server-side services (review README/code inside before changes).
- `docs/`: product and API documentation; update when behavior changes.

## Build, Test, and Development Commands
- Frontend dev server: `cd frontend && npm run dev` (Vite, default port 5173).
- Frontend build: `cd frontend && npm run build` (tsc + Vite production build).
- Frontend lint/type check: `cd frontend && npm run lint` or `npm run check` (tsc -b + eslint).
- Root health check: `npm run doctor` (or `npm run doctor:fix`) to validate/fix common issues.

## Coding Style & Naming Conventions
- TypeScript/React, Tailwind utility-first styling; dark mode uses `dark` class (see `src/store/useThemeStore.ts`).
- Prefer functional components with hooks; colocate styles in Tailwind classes.
- Keep constants and mock/demo data at module scope to avoid hook dependency noise.
- Linting: ESLint (see `frontend/eslint.config.js`); follow lint autofix where possible.
- Use consistent, descriptive names; PascalCase for components, camelCase for variables/functions, SCREAMING_SNAKE_CASE for constants.

## Testing Guidelines
- No formal test suite present; rely on `npm run check` (type + lint) before commits.
- For new logic, add lightweight unit/integration tests in the relevant package if you introduce a test runner; otherwise document manual verification steps in PRs.

## Commit & Pull Request Guidelines
- Commit messages: short imperative summaries (e.g., “Fix dark mode config load”, “Address demo useMemo lint warnings”).
- Ensure working tree clean and `npm run check` passes before commit; Husky hooks run `scripts/scan-secrets.js` and `scripts/smart-check.js`.
- PRs: describe changes, include repro/verification steps, link issues, and add screenshots/GIFs for UI changes (light and dark mode).

## Security & Configuration Tips
- Do not commit secrets; `.env` files should stay local. The secret scanner runs on commit—resolve findings before pushing.
- When touching auth/session or theme persistence, verify `localStorage` keys and initial load behavior (`frontend/src/store/useThemeStore.ts`, `src/main.tsx`).
- Keep proxy targets in `frontend/vite.config.ts` and API base URLs environment-driven for non-local environments. 
