/**
 * Deploy de live update sem passar pela App Store.
 *
 * Uso: node scripts/deploy-update.js
 *
 * Pré-requisitos:
 *   - gh CLI instalado e autenticado (gh auth login)
 *   - npm run build já rodando corretamente
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO = 'almir2015666-cpu/sistema-comercial-app';
const root = path.join(__dirname, '..');
const wwwDir = path.join(root, 'www');
const distDir = path.join(root, 'dist');
const zipPath = path.join(distDir, 'bundle.zip');
const manifestPath = path.join(distDir, 'update-manifest.json');

// ID único baseado em timestamp
const bundleId = `b${Date.now()}`;
const tag = `update-${bundleId}`;

function run(cmd, opts = {}) {
  console.log('>', cmd);
  execSync(cmd, { stdio: 'inherit', ...opts });
}

// 1. Build do app
console.log('\n--- Build ---');
run('npm run build', { cwd: root });

// 2. Cria pasta dist/
if (!fs.existsSync(distDir)) fs.mkdirSync(distDir);

// 3. Compacta www/ em bundle.zip
console.log('\n--- Compactando www/ ---');
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

if (process.platform === 'win32') {
  run(`powershell -Command "Compress-Archive -Path '${wwwDir}\\*' -DestinationPath '${zipPath}'"`);
} else {
  run(`zip -r "${zipPath}" .`, { cwd: wwwDir });
}

// 4. Gera manifest.json com URL definitiva do zip
const manifest = {
  bundleId,
  bundleUrl: `https://github.com/${REPO}/releases/download/${tag}/bundle.zip`,
  releaseDate: new Date().toISOString(),
};
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log('\nManifest:', manifest);

// 5. Cria release no GitHub (--latest faz este ser o "latest")
console.log('\n--- Publicando no GitHub Releases ---');
run(
  `gh release create "${tag}" "${zipPath}" "${manifestPath}" ` +
  `--title "Live Update ${bundleId}" ` +
  `--notes "Atualização automática via live update" ` +
  `--latest`,
  { cwd: root }
);

console.log(`\n✓ Deploy concluído! Bundle: ${bundleId}`);
console.log(`  O app vai atualizar automaticamente na próxima abertura.`);
