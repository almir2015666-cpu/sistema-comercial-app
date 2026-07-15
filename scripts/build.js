// Copia os arquivos web da raiz do projeto para www/, que é a pasta que o
// Capacitor empacota dentro do app iOS (configurada como webDir em capacitor.config.json).
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const www = path.join(root, 'www');

if (!fs.existsSync(www)) fs.mkdirSync(www);

for (const file of ['index.html', 'logo.png', 'watermark.png']) {
  fs.copyFileSync(path.join(root, file), path.join(www, file));
}

// Copia o runtime do Capacitor e o plugin de live update para www/ (necessário
// pois não há bundler). A ordem importa no index.html: capacitor.js define o
// global `capacitorExports`, do qual o plugin.js depende para se registrar.
fs.copyFileSync(
  path.join(root, 'node_modules/@capacitor/core/dist/capacitor.js'),
  path.join(www, 'capacitor.js')
);
fs.copyFileSync(
  path.join(root, 'node_modules/@capawesome/capacitor-live-update/dist/plugin.js'),
  path.join(www, 'live-update-plugin.js')
);

console.log('www/ atualizado a partir de index.html, logo.png e watermark.png.');
