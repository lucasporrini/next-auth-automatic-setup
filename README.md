# next-auth-automatic-setup

A CLI tool to automate the setup of NextAuth in a Next.js project with TypeScript.

## Features

- Automatic setup of NextAuth.js in Next.js projects
- Support for both App Router and Pages Router
- Multiple authentication methods (Providers, Credentials, Magic Link)
- Database integration (MongoDB, PostgreSQL, MySQL)
- TypeScript support
- Automatic environment configuration

## Installation

```bash
npm install -g next-auth-automatic-setup
```

## Usage

In your Next.js project directory, run:

```bash
npx next-auth-automatic-setup
```

Follow the interactive prompts to configure your authentication setup.

## Requirements

- Next.js 13 or higher
- Node.js 14 or higher
- TypeScript

## Configuration Options

- Authentication Types:

  - OAuth Providers (Google, GitHub, etc.)
  - Credentials
  - Magic Link
  - Email/Password

- Database Support:
  - MongoDB
  - PostgreSQL
  - MySQL

## License

MIT

## Author

Lucas PORRINI

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.
