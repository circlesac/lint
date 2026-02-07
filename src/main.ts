#!/usr/bin/env node

import { runMain } from "citty"
import { lintCommand } from "./commands/lint.js"

runMain(lintCommand)
