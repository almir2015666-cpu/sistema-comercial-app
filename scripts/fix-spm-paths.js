// O Capacitor CLI, quando roda no Windows, grava os caminhos relativos dos
// plugins no Package.swift usando barra invertida (separador do Windows).
// Isso e invalido no Swift Package Manager em macOS/Linux (onde o Codemagic
// builda), e quebraria a resolucao de pacotes. Normaliza para barra normal.
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'ios', 'App', 'CapApp-SPM', 'Package.swift');
if (!fs.existsSync(file)) process.exit(0);

const before = fs.readFileSync(file, 'utf8');
const after = before.replace(/path:\s*"([^"]*)"/g, (match, p) => `path: "${p.replace(/\\/g, '/')}"`);

if (before !== after) {
  fs.writeFileSync(file, after);
  console.log('Package.swift: caminhos normalizados para barra normal (compativel com macOS/Linux).');
}
