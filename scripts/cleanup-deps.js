#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const readline = require("readline");

// Colors for terminal output
const colors = {
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  reset: "\x1b[0m",
  bold: "\x1b[1m",
};

class DependencyCleanup {
  constructor() {
    this.packageManager = this.detectPackageManager();
    this.packageJson = this.loadPackageJson();
    this.dependencies = {
      ...(this.packageJson.dependencies || {}),
      ...(this.packageJson.devDependencies || {}),
    };
    this.unusedPackages = [];
    this.debugMode = process.argv.includes("--debug");
    this.dryRun = process.argv.includes("--dry-run");
    this.config = this.loadConfig();

    // Cache files once for performance
    console.log(`${colors.cyan}📁 Scanning project files...${colors.reset}`);
    this.allFiles = this.getAllFiles();
    this.allFileContents = this.cacheFileContents();

    this.stats = {
      removed: 0,
      kept: 0,
      skipped: 0,
    };

    // Check for monorepo
    if (this.packageJson.workspaces) {
      console.log(
        `${colors.yellow}⚠ Monorepo detected (basic support)${colors.reset}`
      );
    }
  }

  detectPackageManager() {
    if (fs.existsSync("pnpm-lock.yaml")) return "pnpm";
    if (fs.existsSync("yarn.lock")) return "yarn";
    if (fs.existsSync("package-lock.json")) return "npm";
    return "npm"; // default
  }

  loadPackageJson() {
    try {
      return JSON.parse(fs.readFileSync("package.json", "utf8"));
    } catch (error) {
      console.error(
        `${colors.red}Error: Could not read package.json${colors.reset}`
      );
      process.exit(1);
    }
  }

  loadConfig() {
    const configFiles = [".cleanupdepsrc", ".cleanupdepsrc.json"];

    for (const configFile of configFiles) {
      if (fs.existsSync(configFile)) {
        try {
          const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
          console.log(
            `${colors.green}📋 Loaded config from ${configFile}${colors.reset}`
          );
          return config;
        } catch (error) {
          console.warn(
            `${colors.yellow}⚠ Invalid config file ${configFile}, ignoring${colors.reset}`
          );
        }
      }
    }

    return { ignore: [], ignorePatterns: [] };
  }

  shouldIgnorePackage(packageName) {
    const { ignore = [], ignorePatterns = [] } = this.config;

    // Direct ignore list
    if (ignore.includes(packageName)) {
      return true;
    }

    // Pattern matching
    for (const pattern of ignorePatterns) {
      const regex = new RegExp(pattern.replace("*", ".*"));
      if (regex.test(packageName)) {
        return true;
      }
    }

    return false;
  }

  // Get all files to scan (excluding node_modules, .git, etc.)
  getAllFiles(dir = ".", files = []) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // Skip these directories
      if (entry.isDirectory()) {
        if (
          ![
            "node_modules",
            ".git",
            ".next",
            "dist",
            "build",
            ".vercel",
            "coverage",
            ".nyc_output",
          ].includes(entry.name)
        ) {
          this.getAllFiles(fullPath, files);
        }
      } else if (entry.isFile()) {
        // Only scan relevant file types
        const ext = path.extname(entry.name);
        if (
          [
            ".js",
            ".jsx",
            ".ts",
            ".tsx",
            ".json",
            ".md",
            ".css",
            ".scss",
            ".vue",
            ".svelte",
          ].includes(ext)
        ) {
          files.push(fullPath);
        }
      }
    }

    return files;
  }

  // Cache file contents for performance
  cacheFileContents() {
    const contents = new Map();
    let cached = 0;

    for (const file of this.allFiles) {
      try {
        contents.set(file, fs.readFileSync(file, "utf8"));
        cached++;
      } catch (error) {
        // Skip files that can't be read
        continue;
      }
    }

    console.log(`${colors.green}✅ Cached ${cached} files${colors.reset}\n`);
    return contents;
  }

  // Check if a package is used in the codebase (now uses cached contents)
  isPackageUsed(packageName) {
    // Escape special regex characters in package name
    const escapedName = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // More precise import patterns - must be exact matches
    const patterns = [
      // ES6 imports: import ... from 'package'
      new RegExp(`import\\s+[^;]+\\s+from\\s+['"\`]${escapedName}['"\`]`, "gm"),
      // Side effect imports: import 'package'
      new RegExp(`^\\s*import\\s+['"\`]${escapedName}['"\`]`, "gm"),
      // CommonJS: require('package')
      new RegExp(`require\\s*\\(\\s*['"\`]${escapedName}['"\`]\\s*\\)`, "gm"),
      // Dynamic imports: import('package')
      new RegExp(`import\\s*\\(\\s*['"\`]${escapedName}['"\`]\\s*\\)`, "gm"),
      // Subpath imports: from 'package/subpath'
      new RegExp(`from\\s+['"\`]${escapedName}/[^'"\`]*['"\`]`, "gm"),
      new RegExp(
        `require\\s*\\(\\s*['"\`]${escapedName}/[^'"\`]*['"\`]\\s*\\)`,
        "gm"
      ),
      new RegExp(
        `import\\s*\\(\\s*['"\`]${escapedName}/[^'"\`]*['"\`]\\s*\\)`,
        "gm"
      ),
    ];

    for (const [file, content] of this.allFileContents) {
      for (const pattern of patterns) {
        if (pattern.test(content)) {
          return true;
        }
      }
    }

    return false;
  }

  // Check if package is used in npm scripts
  isUsedInScripts(packageName) {
    const scripts = this.packageJson.scripts || {};
    return Object.values(scripts).some((script) =>
      script.includes(packageName)
    );
  }

  // Special cases for packages that might not show up in imports
  isSpecialPackage(packageName) {
    const specialPackages = {
      // Build tools and configs
      typescript: () => fs.existsSync("tsconfig.json"),
      eslint: () =>
        fs.existsSync(".eslintrc.json") ||
        fs.existsSync(".eslintrc.js") ||
        fs.existsSync("eslint.config.js"),
      prettier: () =>
        fs.existsSync(".prettierrc") ||
        fs.existsSync("prettier.config.js") ||
        fs.existsSync(".prettierrc.json"),
      postcss: () =>
        fs.existsSync("postcss.config.js") ||
        fs.existsSync("postcss.config.mjs"),
      tailwindcss: () =>
        fs.existsSync("tailwind.config.js") ||
        fs.existsSync("tailwind.config.ts"),

      // Build tools that are often CLI-only
      babel: () =>
        fs.existsSync(".babelrc") || fs.existsSync("babel.config.js"),
      webpack: () => fs.existsSync("webpack.config.js"),
      vite: () =>
        fs.existsSync("vite.config.js") || fs.existsSync("vite.config.ts"),
      rollup: () => fs.existsSync("rollup.config.js"),

      // Git hooks and linting
      husky: () => fs.existsSync(".husky"),
      "lint-staged": () => this.packageJson["lint-staged"],

      // Testing tools
      jest: () => fs.existsSync("jest.config.js") || this.packageJson.jest,
      vitest: () =>
        fs.existsSync("vitest.config.js") || fs.existsSync("vitest.config.ts"),
      cypress: () => fs.existsSync("cypress.config.js"),

      // Environment
      dotenv: () => fs.existsSync(".env") || fs.existsSync(".env.local"),

      // Next.js related
      next: () =>
        this.packageJson.scripts &&
        Object.values(this.packageJson.scripts).some((script) =>
          script.includes("next")
        ),

      // Package managers
      pnpm: () => this.packageManager === "pnpm",
      yarn: () => this.packageManager === "yarn",

      // Types packages (often not directly imported)
      "@types/node": () => true, // Usually needed for Node.js types
      "@types/react": () => this.dependencies["react"],
      "@types/react-dom": () => this.dependencies["react-dom"],
    };

    if (specialPackages[packageName]) {
      return specialPackages[packageName]();
    }

    // Check if it's a @types package for an existing dependency
    if (packageName.startsWith("@types/")) {
      const basePackage = packageName.replace("@types/", "");
      return !!this.dependencies[basePackage];
    }

    return false;
  }

  analyzeUnusedPackages() {
    console.log(
      `${colors.blue}${colors.bold}🔍 Analyzing dependencies...${colors.reset}\n`
    );

    const packageNames = Object.keys(this.dependencies).filter(
      (pkg) => !this.shouldIgnorePackage(pkg)
    );
    let checkedCount = 0;

    for (const packageName of packageNames) {
      if (!this.debugMode) {
        process.stdout.write(
          `\r${colors.cyan}Checking: ${packageName}${" ".repeat(50)}`
        );
      }

      const isUsed = this.isPackageUsed(packageName);
      const isInScripts = this.isUsedInScripts(packageName);
      const isSpecial = this.isSpecialPackage(packageName);
      const shouldKeep = isUsed || isInScripts || isSpecial;

      if (this.debugMode) {
        console.log(`${colors.cyan}Checking: ${packageName}${colors.reset}`);
        console.log(
          `  Used in code: ${
            isUsed ? colors.green + "YES" : colors.red + "NO"
          }${colors.reset}`
        );
        console.log(
          `  Used in scripts: ${
            isInScripts ? colors.green + "YES" : colors.red + "NO"
          }${colors.reset}`
        );
        console.log(
          `  Special package: ${
            isSpecial ? colors.green + "YES" : colors.red + "NO"
          }${colors.reset}`
        );
        console.log(
          `  Result: ${
            shouldKeep ? colors.green + "KEEP" : colors.red + "UNUSED"
          }${colors.reset}\n`
        );
      }

      if (!shouldKeep) {
        this.unusedPackages.push(packageName);
      } else {
        this.stats.kept++;
      }

      checkedCount++;
    }

    if (!this.debugMode) {
      process.stdout.write("\r" + " ".repeat(80) + "\r"); // Clear the line
    }
    console.log(
      `${colors.green}✅ Analyzed ${checkedCount} packages${colors.reset}\n`
    );
  }

  async promptUser(question) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer.toLowerCase().trim());
      });
    });
  }

  getUninstallCommand() {
    const commands = {
      npm: "uninstall",
      yarn: "remove",
      pnpm: "remove",
    };
    return commands[this.packageManager];
  }

  async removePackage(packageName) {
    if (this.dryRun) {
      console.log(
        `${colors.yellow}[DRY RUN] Would remove: ${packageName}${colors.reset}`
      );
      this.stats.removed++;
      return;
    }

    try {
      const command = `${
        this.packageManager
      } ${this.getUninstallCommand()} ${packageName}`;
      console.log(`${colors.yellow}Running: ${command}${colors.reset}`);
      execSync(command, { stdio: "inherit" });
      console.log(`${colors.green}✅ Removed ${packageName}${colors.reset}\n`);
      this.stats.removed++;
    } catch (error) {
      console.log(
        `${colors.red}❌ Failed to remove ${packageName}${colors.reset}\n`
      );
    }
  }

  printSummary() {
    console.log(`\n${colors.bold}${colors.magenta}📊 Summary:${colors.reset}`);
    console.log(`${colors.green}Removed: ${this.stats.removed}${colors.reset}`);
    console.log(`${colors.blue}Kept: ${this.stats.kept}${colors.reset}`);
    console.log(
      `${colors.yellow}Skipped: ${this.stats.skipped}${colors.reset}`
    );
  }

  async run() {
    console.log(
      `${colors.magenta}${colors.bold}📦 Dependency Cleanup Tool${colors.reset}`
    );
    console.log(
      `${colors.cyan}Package Manager: ${this.packageManager}${colors.reset}`
    );

    if (this.dryRun) {
      console.log(
        `${colors.yellow}🔍 DRY RUN MODE - No packages will be removed${colors.reset}`
      );
    }
    console.log();

    this.analyzeUnusedPackages();

    if (this.unusedPackages.length === 0) {
      console.log(
        `${colors.green}🎉 No unused packages found! Your dependencies are clean.${colors.reset}`
      );
      this.printSummary();
      return;
    }

    console.log(
      `${colors.yellow}${colors.bold}📋 Found ${this.unusedPackages.length} potentially unused packages:${colors.reset}`
    );
    this.unusedPackages.forEach((pkg, index) => {
      console.log(`${colors.red}  ${index + 1}. ${pkg}${colors.reset}`);
    });
    console.log();

    if (this.dryRun) {
      console.log(
        `${colors.yellow}[DRY RUN] These packages would be removed.${colors.reset}`
      );
      this.stats.removed = this.unusedPackages.length;
      this.printSummary();
      return;
    }

    const removeAll = await this.promptUser(
      `${colors.blue}Do you want to remove all unused packages? (y/n): ${colors.reset}`
    );

    if (removeAll === "y" || removeAll === "yes") {
      for (const packageName of this.unusedPackages) {
        await this.removePackage(packageName);
      }
    } else {
      // Ask for each package individually
      for (const packageName of this.unusedPackages) {
        const remove = await this.promptUser(
          `${colors.blue}Remove ${colors.bold}${packageName}${colors.reset}${colors.blue}? (y/n/s to skip remaining): ${colors.reset}`
        );

        if (remove === "y" || remove === "yes") {
          await this.removePackage(packageName);
        } else if (remove === "s" || remove === "skip") {
          this.stats.skipped = this.unusedPackages.length - this.stats.removed;
          break;
        } else {
          this.stats.skipped++;
        }
      }
    }

    this.printSummary();
    console.log(
      `${colors.green}${colors.bold}✨ Cleanup complete!${colors.reset}`
    );
  }
}

// Show help
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`
${colors.bold}📦 Dependency Cleanup Tool${colors.reset}

${colors.bold}Usage:${colors.reset}
  node cleanup-deps.js [options]

${colors.bold}Options:${colors.reset}
  --debug        Show detailed analysis for each package
  --dry-run      Show what would be removed without actually removing
  --help, -h     Show this help message

${colors.bold}Config file (.cleanupdepsrc):${colors.reset}
{
  "ignore": ["eslint", "prettier"],
  "ignorePatterns": ["@types/*", "*-loader"]
}
`);
  process.exit(0);
}

// Run the cleanup
const cleanup = new DependencyCleanup();
cleanup.run().catch(console.error);
