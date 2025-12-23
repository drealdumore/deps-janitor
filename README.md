# deps-janitor 🧹

Your friendly dependency cleaner! Sweeps away unused npm packages so your project stays tidy.

## Why "Janitor"?

Because janitors clean up messes → unused deps are messes → deps-janitor cleans them up. Simple!

## Features

- 🧹 **Smart Sweeping**: Finds truly dusty (unused) dependencies in your codebase
- 🔍 **Thorough Inspection**: Checks imports, requires, dynamic imports, and subpaths
- 🏷️ **VIP Treatment**: Recognizes special packages (build tools, configs, types)
- 💬 **Friendly Chat**: Interactive prompts with personality
- 🛠️ **Multi-Tool Support**: Works with npm, yarn, and pnpm
- 🏢 **Building Aware**: Basic monorepo support
- 👀 **Inspection Mode**: Dry-run to see what would get the boot
- ⚡ **Quick Work**: Caches files for speedy cleaning

## Installation

### Global Installation

```bash
npm install -g deps-janitor
```

### Local Installation

```bash
npm install --save-dev deps-janitor
```

## Usage

### Basic Usage

```bash
deps-janitor
```

### Options

```bash
deps-janitor --dry-run    # Preview what would be removed
deps-janitor --debug      # Show detailed analysis
deps-janitor --help       # Show help
```

### As npm script

Add to your `package.json`:

```json
{
  "scripts": {
    "cleanup-deps": "deps-janitor"
  }
}
```

Then run:

```bash
npm run cleanup-deps
```

## Configuration

Create a `.cleanupdepsrc` or `.cleanupdepsrc.json` file in your project root to customize which packages to keep:

```json
{
  "ignore": ["eslint", "prettier"],
  "ignorePatterns": ["@types/*", "*-loader"]
}
```

**Quick start**: Copy the included `.cleanupdepsrc.example` file to `.cleanupdepsrc` and customize it for your project:

```bash
cp .cleanupdepsrc.example .cleanupdepsrc
```

### Configuration Options

- `ignore`: Array of package names to always keep (exact matches)
- `ignorePatterns`: Array of glob patterns for packages to ignore (supports wildcards)

## How It Works

1. **File Scanning**: Scans your project files (excluding node_modules, .git, etc.)
2. **Import Analysis**: Looks for various import patterns:
   - ES6 imports: `import ... from 'package'`
   - CommonJS: `require('package')`
   - Dynamic imports: `import('package')`
   - Subpath imports: `from 'package/subpath'`
3. **Special Cases**: Checks for config files and build tools
4. **Script Analysis**: Verifies usage in npm scripts
5. **Interactive Removal**: Prompts for confirmation before removing packages

## Supported Package Managers

- npm
- yarn
- pnpm

The tool automatically detects your package manager based on lock files.

## Examples

### Basic cleanup

```bash
$ deps-janitor
🧹 deps-janitor reporting for duty!
🏢 Building: my-awesome-app
🛠️  Tools: npm

🧹 Checking the halls for messes...
🗂️  Found 45 files to inspect

🔍 Time to sweep for dusty packages...
🧹 Swept through 23 packages

🗂️  Found 3 dusty packages collecting cobwebs:
  1. 📦 lodash
  2. 📦 moment
  3. 📦 unused-package

🧹 Clean sweep? Remove all dusty packages? (y/n): y
🗑️  Tossing: npm uninstall lodash
✨ lodash swept away!
```

### Inspection mode

```bash
$ deps-janitor --dry-run
👀 INSPECTION MODE - Just checking, no cleaning yet

👀 [INSPECTION] Would toss: lodash
👀 [INSPECTION] Would toss: moment

🧹 Cleaning Report:
🗑️  Tossed: 2
✨ Kept tidy: 21
⏭️  Skipped: 0
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
