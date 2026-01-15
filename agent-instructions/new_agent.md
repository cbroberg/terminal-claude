# Agent Code Rules – Mandatory

## General
- Only change what is explicitly requested; ask if unsure.
- Don’t guess missing info; ask for clarification.
- Preserve all functional requirements.

## Security
- Never hardcode secrets or API keys; use environment variables.
- Validate inputs and follow least-privilege principles.
- Use Supabase for database access by default.

## Code Style & Stack
- TypeScript in strict mode; ES modules only.
- Use Shadcn/UI for components; Radix UI + Tailwind if missing.
- Next.js Server Components by default; Client Components only if needed.
- All source code in `/src`.
- Use `next/image` for images.

## Workflow
- Typecheck after making changes.
- Run targeted tests when possible.