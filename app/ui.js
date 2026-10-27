/* =====================================================================
   CMH Sistema — interface: toast, folha, navegacao em pilha, abas.

   Toda tela e uma funcao que desenha dentro do palco e devolve, se quiser,
   uma funcao de limpeza (parar timers). As abas de baixo trocam a RAIZ da
   pilha; abrir um item empilha por cima e mostra o botao de voltar.
   ===================================================================== */
// Os modulos (modulos/*.js) se registram aqui; o app.js le. Nasce neste
// arquivo porque ele e carregado antes de todos eles.
window.MODULOS = window.MODULOS || {};

window.UI = (() => {
  'use strict';

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (sel, raiz = document) => raiz.querySelector(sel);
  const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];
  const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));

  /* ------------------------------------------------------------ toast */
  let toastTimer = null;
  function toast(msg, tipo = 'info', ms = 3200) {
    const el = $('#toast');
    el.textContent = msg;
    el.className = `toast ${tipo} show`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), ms);
  }

  function carregando(ligado, texto = '') {
    const el = $('#carregando');
    $('#carregando-texto').textContent = texto;
    el.hidden = !ligado;
  }

  /* ------------------------------------------------------------ folha */
  const pilhaFolhas = [];
  function folha(html, { titulo = '', aoFechar = null, semFechar = false } = {}) {
    const ov = $('#folha'), caixa = $('#folha-caixa');
    caixa.innerHTML = `<div class="puxador"></div>` +
      (titulo || !semFechar ? `<div class="modal-hd"><div class="modal-title">${esc(titulo)}</div>${semFechar ? '' : '<button class="modal-fechar" type="button" aria-label="Fechar">✕</button>'}</div>` : '') +
      html;
    ov.hidden = false;
    document.body.style.overflow = 'hidden';
    const fechar = () => {
      if (pilhaFolhas[pilhaFolhas.length - 1] !== fechar) return;
      pilhaFolhas.pop();
      ov.hidden = true; caixa.innerHTML = ''; document.body.style.overflow = '';
      if (aoFechar) aoFechar();
    };
    pilhaFolhas.push(fechar);
    const bt = $('.modal-fechar', caixa);
    if (bt) bt.onclick = fechar;
    ov.onclick = (e) => { if (e.target === ov && !semFechar) fechar(); };
    return { caixa, fechar };
  }
  function fecharFolha() { const f = pilhaFolhas[pilhaFolhas.length - 1]; if (f) f(); }

  function confirmar(pergunta, { ok = 'Sim', cancelar = 'Não', perigo = false, titulo = '' } = {}) {
    return new Promise((resolve) => {
      const f = folha(`<p style="font-size:15px;line-height:1.5">${esc(pergunta)}</p>
        <div class="modal-ft"><button class="btn btn-ghost" id="cf-nao" type="button">${esc(cancelar)}</button>
        <button class="btn ${perigo ? 'btn-danger' : 'btn-ok'}" id="cf-sim" type="button">${esc(ok)}</button></div>`,
        { titulo, aoFechar: () => resolve(false) });
      $('#cf-sim', f.caixa).onclick = () => { resolve(true); f.aoFechar = null; f.fechar(); };
      $('#cf-nao', f.caixa).onclick = () => f.fechar();
    });
  }

  function perguntar(titulo, { rotulo = '', valor = '', multilinha = false, obrigatorio = true, ok = 'Salvar', placeholder = '' } = {}) {
    return new Promise((resolve) => {
      const campo = multilinha
        ? `<textarea id="pg-v" placeholder="${esc(placeholder)}">${esc(valor)}</textarea>`
        : `<input id="pg-v" value="${esc(valor)}" placeholder="${esc(placeholder)}">`;
      const f = folha(`<form id="pg-form"><div class="fg">${rotulo ? `<label for="pg-v">${esc(rotulo)}</label>` : ''}${campo}</div>
        <div class="modal-ft"><button class="btn btn-ghost" type="button" id="pg-nao">Cancelar</button><button class="btn btn-ok" type="submit">${esc(ok)}</button></div></form>`,
        { titulo, aoFechar: () => resolve(null) });
      const v = $('#pg-v', f.caixa);
      setTimeout(() => v.focus(), 50);
      $('#pg-nao', f.caixa).onclick = () => f.fechar();
      $('#pg-form', f.caixa).onsubmit = (e) => {
        e.preventDefault();
        const t = v.value.trim();
        if (obrigatorio && !t) { v.focus(); return; }
        resolve(t); f.fechar();
      };
    });
  }

  /* -------------------------------------------------------- navegacao */
  const pilha = [];
  let limpezaAtual = null;
  let abaAtual = null;
  const abas = [];

  function desenharTopo(tela) {
    $('#topo-titulo').textContent = tela.titulo || '';
    $('#voltar').hidden = pilha.length <= 1;
    $('#topo-dir').innerHTML = tela.dir || '';
    if (tela.aoTopo) tela.aoTopo($('#topo-dir'));
  }

  async function mostrar(tela) {
    if (limpezaAtual) { try { limpezaAtual(); } catch { /* segue */ } limpezaAtual = null; }
    const palco = $('#palco');
    palco.className = 'palco' + (tela.classe ? ' ' + tela.classe : '') + (abas.length ? '' : ' sem-abas');
    palco.innerHTML = '';
    desenharTopo(tela);
    window.scrollTo(0, 0);
    try {
      const r = await tela.desenhar(palco, tela);
      if (typeof r === 'function') limpezaAtual = r;
    } catch (e) {
      console.error(e);
      palco.innerHTML = `<div class="aviso erro">Não deu para abrir esta tela: ${esc(e.message || e)}</div>`;
    }
  }

  function ir(tela) { pilha.push(tela); return mostrar(tela); }
  function raiz(tela, chaveAba) {
    pilha.length = 0; pilha.push(tela);
    abaAtual = chaveAba || null;
    $$('.abas__item').forEach((b) => b.classList.toggle('on', b.dataset.aba === abaAtual));
    return mostrar(tela);
  }
  function voltar() {
    if (pilha.length <= 1) return;
    pilha.pop();
    return mostrar(pilha[pilha.length - 1]);
  }
  function redesenhar() { const t = pilha[pilha.length - 1]; if (t) return mostrar(t); }
  function telaAtual() { return pilha[pilha.length - 1]; }

  function montarAbas(lista) {
    abas.length = 0; abas.push(...lista);
    const nav = $('#abas');
    nav.innerHTML = lista.map((a) =>
      `<button class="abas__item" type="button" data-aba="${esc(a.chave)}">${a.icone}<span>${esc(a.rotulo)}</span><span class="abas__n" data-n="${esc(a.chave)}" hidden></span></button>`).join('');
    nav.hidden = !lista.length;
    $$('.abas__item', nav).forEach((b) => { b.onclick = () => { const a = lista.find((x) => x.chave === b.dataset.aba); if (a) a.abrir(); }; });
  }
  function badgeAba(chave, n) {
    const el = $(`.abas__n[data-n="${CSS.escape(chave)}"]`);
    if (!el) return;
    el.hidden = !n; el.textContent = n > 99 ? '99+' : String(n);
  }

  $('#voltar').onclick = () => voltar();

  /* ----------------------------------------------------------- pecas */
  const ICONES = {
    inicio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/></svg>',
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12z"/></svg>',
    tarefas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l2 2 4-4"/><rect x="4" y="4" width="16" height="16" rx="3"/></svg>',
    compromissos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>',
    chamados: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 0 5 5L14 17a2.8 2.8 0 0 1-4 0l-.5-.5a2.8 2.8 0 0 1 0-4l5.2-6.2z"/><path d="M4 20l5-5"/></svg>',
    conferencia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h10"/><path d="M17 16l2 2 3-3"/></svg>',
    diario: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 0-3 3z"/><path d="M5 4v16M9 8h6M9 12h6"/></svg>',
    admin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    emails: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 6.5l8.5 6 8.5-6"/></svg>',
    pesquisa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>',
    mais: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/></svg>',
    perfil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0115 0"/></svg>',
    busca: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    seta: '<svg class="linha__seta" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
    mais_circ: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    anexo: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.5l-8.5 8.5a5.5 5.5 0 0 1-7.8-7.8l9-9a3.5 3.5 0 0 1 5 5l-9 9a1.5 1.5 0 0 1-2.1-2.1l8-8"/></svg>',
    enviar: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/></svg>',
  };

  const avatar = (nome, tam = 40, online = null) =>
    `<span class="avatar av-${tam}">${esc(L.iniciais(nome) || '?')}${online === null ? '' : `<i class="bolinha ${online ? 'on' : ''}"></i>`}</span>`;

  const vazio = (titulo, texto = '') => `<div class="vazio"><strong>${esc(titulo)}</strong>${esc(texto)}</div>`;

  // Um botao de topo (icone) com acao.
  function botaoTopo(html, aoClicar, rotulo = '') {
    const b = document.createElement('button');
    b.className = 'btn-icon'; b.type = 'button'; b.innerHTML = html; b.setAttribute('aria-label', rotulo || 'ação');
    b.onclick = aoClicar;
    return b;
  }

  // Data legivel para listas: hoje -> hora, este ano -> dd/mm, senao dd/mm/aa.
  function quando(iso) {
    if (!iso) return '';
    const d = new Date(iso); if (Number.isNaN(d.getTime())) return '';
    const hoje = new Date();
    if (d.toDateString() === hoje.toDateString()) return L.horaBr(iso);
    const dd = String(d.getDate()).padStart(2, '0'), mm = String(d.getMonth() + 1).padStart(2, '0');
    return d.getFullYear() === hoje.getFullYear() ? `${dd}/${mm}` : `${dd}/${mm}/${String(d.getFullYear()).slice(2)}`;
  }

  // Segunda-feira, 19 de setembro
  const diaPorExtenso = (iso) => {
    const d = L.diaDe(iso); if (!d) return '';
    const s = d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  // Escolhe um arquivo do aparelho; devolve File ou null.
  function escolherArquivo(accept = '*/*') {
    return new Promise((resolve) => {
      const inp = $('#arquivo');
      inp.value = ''; inp.accept = accept;
      inp.onchange = () => resolve(inp.files && inp.files[0] ? inp.files[0] : null);
      inp.click();
    });
  }

  // Abre um endereco por cima do app (navegador do Capacitor), sem sair dele.
  async function abrirFora(url) {
    try {
      const B = window.Capacitor?.Plugins?.Browser;
      if (B) return await B.open({ url, presentationStyle: 'popover' });
    } catch { /* cai no navegador comum */ }
    window.open(url, '_blank');
  }

  function temaAtual() { return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }
  function trocarTema() {
    const novo = temaAtual() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', novo === 'dark' ? 'dark' : '');
    if (novo === 'light') document.documentElement.removeAttribute('data-theme');
    try { localStorage.setItem('cmh_theme', novo); } catch { /* sem localStorage */ }
  }

  // Um pequeno "select" de opcoes como HTML.
  const opcoes = (lista, atual) => lista.map((o) => {
    const [v, r] = Array.isArray(o) ? o : [o, o];
    return `<option value="${esc(v)}" ${String(v) === String(atual ?? '') ? 'selected' : ''}>${esc(r || '—')}</option>`;
  }).join('');

  return { esc, $, $$, esperar, toast, carregando, folha, fecharFolha, confirmar, perguntar,
    ir, raiz, voltar, redesenhar, telaAtual, montarAbas, badgeAba, ICONES, avatar, vazio, botaoTopo,
    quando, diaPorExtenso, escolherArquivo, abrirFora, temaAtual, trocarTema, opcoes };
})();
