import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');

function run(name, command, args, color) {
  const child = spawn(command, args, {
    cwd: root,
    env: { ...process.env, FORCE_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const tag = (buf) => {
    const text = buf.toString();
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      console.log(`${color}[${name}]\x1b[0m ${line}`);
    }
  };

  child.stdout.on('data', tag);
  child.stderr.on('data', tag);
  child.on('exit', (code) => {
    console.log(`${color}[${name}]\x1b[0m exited (${code})`);
    process.exit(code ?? 1);
  });
  return child;
}

run('api', process.execPath, ['server/index.js'], '\x1b[36m');
run('web', process.execPath, [viteBin, '--config', 'client/vite.config.js'], '\x1b[35m');
