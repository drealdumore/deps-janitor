# deps-janitor 🧹

Your friendly, high-intelligence dependency cleaner! Sweeps away unused npm packages so your project stays lean, secure, and tidy.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![NPM Version](https://img.shields.io/npm/v/deps-janitor.svg)](https://www.npmjs.com/package/deps-janitor)

## Why "Janitor"?

In modern web development, frameworks often install a "mess" of dependencies "just in case." Over time, these gather cobwebs, slow down your CI/CD, and introduce security risks. **deps-janitor** doesn't just search for code; it understands the complex relationships between your packages.

## ✨ Features

- 🧠 **Triple-Pass Analysis**: Uses a sophisticated three-stage sweep to ensure nothing important is tossed.
- 🤝 **The Buddy System (Peer Rescue)**: Automatically protects dependencies required by your active packages (e.g., keeping `autoprefixer` if you use `tailwind`).
- 🧩 **Plugin Aware**: Detects packages used as strings in configuration files (perfect for ESLint, PostCSS, and Vite plugins).
- 🏷️ **Smart Type Management**: Automatically keeps `@types` for active packages and clears them for removed ones.
- 🔍 **Debug Insights**: Use `--debug` to see exactly _why_ a package was kept (e.g., "Rescued: Peer dependency of X").
- 💬 **Interactive Personality**: A friendly CLI experience that makes cleaning up less of a chore.
- 🛠️ **Multi-Tool Support**: Context-aware detection for **npm**, **yarn**, and **pnpm**.
- 👀 **Inspection Mode**: Safety first with `--dry-run` to preview the sweep.

## 🚀 Installation

### Global Installation

```bash
npm install -g deps-janitor
```

### Local Installation

```bash
npm install --save-dev deps-janitor
```

## 📖 Usage

### Basic Usage

```bash
deps-janitor
```

### Advanced Options

| Option      | Description                                                                |
| :---------- | :------------------------------------------------------------------------- |
| `--dry-run` | **Inspection Mode**: Preview what would be removed without touching files. |
| `--debug`   | **X-Ray Vision**: See the specific reasoning/pass that saved each package. |
| `--help`    | Show the helper manual.                                                    |

### As an npm script

Add this to your `package.json` to keep the building tidy:

```json
{
  "scripts": {
    "gc": "deps-janitor"
  }
}
```

## 🛠️ How It Works (The Triple-Pass)

Unlike simple grep tools, **deps-janitor** performs a deep contextual sweep:

1.  **Pass 1: Direct Usage**: Scans for ES6 imports, CommonJS `require`, dynamic imports, and usage in `package.json` scripts. It also scans string literals to find plugins in config files.
2.  **Pass 2: Peer Rescue**: Looks inside the `node_modules` of every package marked "Keep" to identify `peerDependencies`. If a "dusty" package is actually a peer of a kept package, it is rescued.
3.  **Pass 3: Type Alignment**: Syncs all `@types/` packages with their parent libraries.

## ⚙️ Configuration

Create a `.cleanupdepsrc` or `.cleanupdepsrc.json` in your root to customize the Janitor's behavior:

```json
{
  "ignore": ["eslint", "prettier"],
  "ignorePatterns": ["@types/*", "*-loader"]
}
```

- `ignore`: Packages that should NEVER be removed (exact matches).
- `ignorePatterns`: Wildcard patterns (e.g., `*lint*`) for bulk ignoring.

## 🏢 Supported Environments

- **Monorepo Aware**: Basic support for detecting workspace structures.
- **Framework Ready**: Tailored logic for Next.js, Vite, Tailwind, ESLint, and more.

## 📜 License

MIT

## 🤝 Contributing

The building is big, and we can always use more hands! If you have a framework-specific edge case or a new idea, feel free to submit a Pull Request.

---

_Keep your dependencies tidy!_ 🧹
