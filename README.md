# @circlesac/lint

🔧 A zero-config lint tool that uses ESLint, Prettier, and Biome

## Features

- Automatically ignores `.venv` directories (used by `uv` and other Python tools)

## Usage

### Use with `npx` (recommended)

```bash
npx @circlesac/lint
```

### Examples

```bash
# Run all tools
npx @circlesac/lint --all

# Run specific tools
npx @circlesac/lint --eslint
npx @circlesac/lint --prettier --biome

# Show help
npx @circlesac/lint
```
