// Every test run gets its own empty data folder, so tests never touch a real board.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.TASKBOARD_DATA = mkdtempSync(path.join(tmpdir(), 'taskboard-test-'));
process.env.TASKBOARD_OWNER_TOKEN_FILE = path.join(process.env.TASKBOARD_DATA, 'no-token');
