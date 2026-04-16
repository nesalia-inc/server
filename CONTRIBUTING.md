# Contributing to @deessejs/server

Thank you for your interest in contributing to @deessejs/server!

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+

### Setup

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/server.git`
3. Install dependencies: `pnpm install`

### Development

```bash
# Run tests
pnpm test:run

# Run type checking
pnpm typecheck

# Run linter
pnpm lint
```

## How Can I Contribute?

### Reporting Bugs

Before creating a bug report:
- Check the existing issues to see if it's already reported
- If you're unable to find an open issue addressing the problem, create a new one

When filing a bug, include:
- A quick summary and background
- Steps to reproduce
- What you expected vs what happened
- Notes (possibly including why you think this might be happening)

### Suggesting Enhancements

Open a new issue with:
- A clear title and description
- Specific steps for the suggested feature
- Explain why this enhancement would be useful

### Pull Requests

1. Fork the repo and create your branch from `main`
2. If you've added code that should be tested, add tests
3. If you've changed APIs, update the documentation
4. Ensure all tests pass
5. Make sure your code lints
6. Submit a Pull Request

### Coding Style

- Use TypeScript with strict mode
- Run `pnpm lint` before committing
- Run `pnpm typecheck` before committing
- Run `pnpm test:run` to ensure all tests pass

## Project Structure

```
packages/server/
├── src/
│   └── index.ts      # Main entry point
├── tsconfig.json     # TypeScript configuration
├── vitest.config.ts  # Vitest configuration
└── package.json      # Package configuration
```

## Commit Messages

- Use clear, descriptive commit messages
- Start with a verb (Add, Fix, Update, Remove)
- Keep the first line under 72 characters

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
