// PostToolUse hook: after Claude edits a locale file in src/i18n/, run the i18n
// parity check. On failure, exit 2 so the report is fed back to Claude.
import { execFileSync } from 'child_process';

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  let filePath = '';
  try {
    filePath = JSON.parse(input)?.tool_input?.file_path || '';
  } catch {
    process.exit(0);
  }
  if (!/[\\/]src[\\/]i18n[\\/][^\\/]+\.json$/.test(filePath)) process.exit(0);

  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  try {
    execFileSync(process.execPath, ['scripts/check-i18n.mjs'], { cwd: root, stdio: 'pipe' });
    process.exit(0);
  } catch (err) {
    const out = `${err.stdout || ''}${err.stderr || ''}`.trim();
    process.stderr.write(`check-i18n failed after editing ${filePath}:\n${out}\n` +
      'If you are still editing the other locale files, finish them, then re-run node scripts/check-i18n.mjs.\n');
    process.exit(2);
  }
});
