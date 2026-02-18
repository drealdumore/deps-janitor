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
    console.log(
      `${colors.cyan}🧹 Checking the halls for messes...${colors.reset}`
    );
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

    console.log(
      `${colors.green}🗂️  Found ${cached} files to inspect${colors.reset}\n`
    );
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
      // Config or plugin string references: "package" or 'package'
      new RegExp(`['"\`]${escapedName}['"\`]`, "gm"),
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

  // Get peer dependencies of a package from node_modules
  getPeerDependencies(packageName) {
    try {
      const pkgPath = path.join("node_modules", packageName, "package.json");
      if (fs.existsSync(pkgPath)) {
        const pkgJson = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        return Object.keys(pkgJson.peerDependencies || {});
      }
    } catch (error) {
      if (this.debugMode) {
        console.log(
          `\n${colors.yellow}  ⚠ Could not read peer dependencies for ${packageName}${colors.reset}`
        );
      }
    }
    return [];
  }

  analyzeUnusedPackages() {
    console.log(
      `${colors.blue}${colors.bold}🔍 Time to sweep for dusty packages...${colors.reset}\n`
    );

    const packageNames = Object.keys(this.dependencies).filter(
      (pkg) => !this.shouldIgnorePackage(pkg)
    );

    const verdict = new Map();
    const reasons = new Map();

    // Pass 1: Code, Scripts, Special
    for (const packageName of packageNames) {
      if (!this.debugMode) {
        process.stdout.write(
          `\r${colors.cyan}🧽 Dusting off: ${packageName}${" ".repeat(50)}`
        );
      }

      const isUsed = this.isPackageUsed(packageName);
      const isInScripts = this.isUsedInScripts(packageName);
      const isSpecial = this.isSpecialPackage(packageName);

      if (isUsed || isInScripts || isSpecial) {
        verdict.set(packageName, true);
        reasons.set(
          packageName,
          isUsed
            ? "Used in code"
            : isInScripts
            ? "Used in scripts"
            : "Special package"
        );
      } else {
        verdict.set(packageName, false);
      }
    }

    // Pass 2: Peer Dependencies
    for (const packageName of packageNames) {
      if (verdict.get(packageName)) {
        const peers = this.getPeerDependencies(packageName);
        for (const peer of peers) {
          if (this.dependencies[peer] && !verdict.get(peer)) {
            verdict.set(peer, true);
            reasons.set(peer, `Peer dependency of ${packageName}`);
            if (this.debugMode) {
              console.log(
                `${colors.magenta}  🤝 Rescued ${peer} (Peer of ${packageName})${colors.reset}`
              );
            }
          }
        }
      }
    }

    // Pass 3: @types cleanup (context aware)
    for (const packageName of packageNames) {
      if (packageName.startsWith("@types/")) {
        const basePackage = packageName.replace("@types/", "");
        if (this.dependencies[basePackage] && verdict.get(basePackage)) {
          verdict.set(packageName, true);
          reasons.set(packageName, `Type definitions for ${basePackage}`);
        }
      }
    }

    // Summary and Final List
    for (const packageName of packageNames) {
      if (verdict.get(packageName)) {
        this.stats.kept++;
        if (this.debugMode) {
          console.log(
            `${colors.cyan}� Inspecting: ${packageName}${colors.reset}`
          );
          console.log(
            `  🧹 Verdict: ${colors.green}KEEP (${
              reasons.get(packageName) || "Already safe"
            })${colors.reset}\n`
          );
        }
      } else {
        this.unusedPackages.push(packageName);
        if (this.debugMode) {
          console.log(
            `${colors.cyan}🧽 Inspecting: ${packageName}${colors.reset}`
          );
          console.log(
            `  🧹 Verdict: ${colors.red}NEEDS CLEANING${colors.reset}\n`
          );
        }
      }
    }

    if (!this.debugMode) {
      process.stdout.write("\r" + " ".repeat(80) + "\r"); // Clear the line
    }
    console.log(
      `${colors.green}🧹 Swept through ${packageNames.length} packages${colors.reset}\n`
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
        `${colors.yellow}👀 [INSPECTION] Would toss: ${packageName}${colors.reset}`
      );
      this.stats.removed++;
      return;
    }

    try {
      const command = `${
        this.packageManager
      } ${this.getUninstallCommand()} ${packageName}`;
      console.log(`${colors.yellow}🗑️  Tossing: ${command}${colors.reset}`);
      execSync(command, { stdio: "inherit" });
      console.log(
        `${colors.green}✨ ${packageName} swept away!${colors.reset}\n`
      );
      this.stats.removed++;
    } catch (error) {
      console.log(
        `${colors.red}💥 Oops! Couldn't remove ${packageName}${colors.reset}\n`
      );
    }
  }

  printSummary() {
    console.log(
      `\n${colors.bold}${colors.magenta}🧹 Cleaning Report:${colors.reset}`
    );
    console.log(
      `${colors.green}🗑️  Tossed: ${this.stats.removed}${colors.reset}`
    );
    console.log(
      `${colors.blue}✨ Kept tidy: ${this.stats.kept}${colors.reset}`
    );
    console.log(
      `${colors.yellow}⏭️  Skipped: ${this.stats.skipped}${colors.reset}`
    );
  }

  async run() {
    console.log(
      `${colors.magenta}${colors.bold}🧹 deps-janitor reporting for duty!${colors.reset}`
    );
    console.log(
      `${colors.cyan}🏢 Building: ${
        this.packageJson.name || "Unknown Project"
      }${colors.reset}`
    );
    console.log(
      `${colors.cyan}🛠️  Tools: ${this.packageManager}${colors.reset}`
    );

    if (this.dryRun) {
      console.log(
        `${colors.yellow}👀 INSPECTION MODE - Just checking, no cleaning yet${colors.reset}`
      );
    }
    console.log();

    this.analyzeUnusedPackages();

    if (this.unusedPackages.length === 0) {
      console.log(
        `${colors.green}✨ Floors are spotless! No dusty packages found.${colors.reset}`
      );
      this.printSummary();
      return;
    }

    console.log(
      `${colors.yellow}${colors.bold}🗂️  Found ${this.unusedPackages.length} dusty packages collecting cobwebs:${colors.reset}`
    );
    this.unusedPackages.forEach((pkg, index) => {
      console.log(`${colors.red}  ${index + 1}. 📦 ${pkg}${colors.reset}`);
    });
    console.log();

    if (this.dryRun) {
      console.log(
        `${colors.yellow}👀 [INSPECTION] These packages would get the boot.${colors.reset}`
      );
      this.stats.removed = this.unusedPackages.length;
      this.printSummary();
      return;
    }

    const removeAll = await this.promptUser(
      `${colors.blue}🧹 Clean sweep? Remove all dusty packages? (y/n): ${colors.reset}`
    );

    if (removeAll === "y" || removeAll === "yes") {
      for (const packageName of this.unusedPackages) {
        await this.removePackage(packageName);
      }
    } else {
      // Ask for each package individually
      for (const packageName of this.unusedPackages) {
        const remove = await this.promptUser(
          `${colors.blue}🗑️  Toss ${colors.bold}${packageName}${colors.reset}${colors.blue} in the bin? (y/n/s to skip remaining): ${colors.reset}`
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
      `${colors.green}${colors.bold}✨ All clean! Building's looking sharp.${colors.reset}`
    );
  }
}

// Show help
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`
${colors.bold}🧹 deps-janitor - Your Friendly Dependency Cleaner${colors.reset}

${colors.bold}Usage:${colors.reset}
  deps-janitor [options]

${colors.bold}Options:${colors.reset}
  --debug        🔍 Show detailed inspection for each package
  --dry-run      👀 Inspection mode - see what would be cleaned
  --help, -h     📖 Show this help message

${colors.bold}Janitor's Toolkit (.cleanupdepsrc):${colors.reset}
{
  "ignore": ["eslint", "prettier"],
  "ignorePatterns": ["@types/*", "*-loader"]
}

${colors.cyan}🧹 Keep your dependencies tidy!${colors.reset}
`);
  process.exit(0);
}

// Run the cleanup
const cleanup = new DependencyCleanup();
cleanup.run().catch(console.error);
