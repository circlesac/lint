#!/usr/bin/env node

import packageJson from "../package.json" with { type: "json" }
import { LintCommand } from "./commands/lint.js"

const program = new LintCommand()
program.name(packageJson.name)
program.description(packageJson.description)
program.version(packageJson.version)

program.parse()
