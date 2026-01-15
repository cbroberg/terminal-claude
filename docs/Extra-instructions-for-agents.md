ot! Here’s how to play nice with our setup:

## 🎯 Core Principles
- Use existing components from our design system package.
- Follow WCAG accessibility standards.
- Optimize for performance. Linear time/space preferred.
- Always consider responsiveness (Tailwind breakpoints).
- Use design tokens instead of hardcoded values.

## 🧱 Component Usage
- Follow TypeScript types, props, and inputs/outputs.
- Use PascalCase for components, camelCase for props/vars.
- Prefer functional (React) or standalone (Angular) components.
- Respect one-way data flow patterns.

## 🎨 Tailwind Styling
- Use utility classes from Tailwind v<YOUR_VERSION>.
- Prefer custom tokens (e.g. `bg-brand-primary`, `padding-md`).
- Never use inline styles.
- Apply responsive classes (`sm:`, `md:`, etc).
- Incorporate any custom Tailwind utilities we’ve defined.

## ✅ Best Practices
- Follow our linting and formatting rules.
- Structure components cleanly.
- Respect state management conventions.
- Use explicit TypeScript types.
- Suggest testable code.

## 🛑 Avoid
- Rebuilding existing components.
- Hardcoded styles or values.
- Inaccessible patterns.
- Poor performance.
- Inconsistent naming.
- Ignoring TypeScript errors.
- Unnecessary DOM manipulation.