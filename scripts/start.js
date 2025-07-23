/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law_or_agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { spawn, execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));

// check build status, write warnings to file for app to display if needed
execSync('node ./scripts/check-build-status.js', {
  stdio: 'inherit',
  cwd: root,
});

const nodeArgs = [];
// Sandbox functionality removed for TermiChat
// if debugging is enabled, use --inspect-brk flag
if (process.env.DEBUG) {
  nodeArgs.push('--inspect-brk');
}

nodeArgs.push('./packages/cli');
nodeArgs.push(...process.argv.slice(2));

const env = {
  ...process.env,
  CLI_VERSION: pkg.version,
  DEV: 'true',
};

if (process.env.DEBUG) {
  // If this is not set, the debugger will pause on the outer process rather
  // than the relaunched process making it harder to debug.
  env.TERMICHAT_NO_RELAUNCH = 'true';
}
const child = spawn('node', nodeArgs, { stdio: 'inherit', env });

child.on('close', (code) => {
  process.exit(code);
});
