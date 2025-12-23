# deps-janitor 🧹

Interactive tool that helps you find and remove unused npm dependencies from your projects — safely.

## Features

- 🔍 **Smart Detection**: Analyzes your codebase to find truly unused dependencies
- 🎯 **Accurate Analysis**: Checks imports, requires, dynamic imports, and subpath imports
- ⚙️ **Special Package Support**: Recognizes build tools, configs, and type packages
- 🎨 **Interactive CLI**: Choose which packages to remove with colorful output
- 🔧 **Multi Package Manager**: Supports npm, yarn, and pnpm
- 🏗️ **Monorepo Aware**: Basic support for monorepo structures
- 🛡️ **Safe Mode**: Dry-run option to preview changes
- ⚡ **Fast**: Caches file contents for quick analysis

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
📦 Dependency Cleanup Tool
Package Manager: npm

📁 Scanning project files...
✅ Cached 45 files

🔍 Analyzing dependencies...
✅ Analyzed 23 packages

📋 Found 3 potentially unused packages:
  1. lodash
  2. moment
  3. unused-package

Do you want to remove all unused packages? (y/n): y
```

### Dry run

```bash
$ deps-janitor --dry-run
🔍 DRY RUN MODE - No packages will be removed

[DRY RUN] Would remove: lodash
[DRY RUN] Would remove: moment

📊 Summary:
Removed: 2
Kept: 21
Skipped: 0
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
