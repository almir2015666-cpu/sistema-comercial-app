/* =====================================================================
   CMH Sistema — entrada, inicio, perfil, abas e os avisadores.

   Os modulos se registram em window.MODULOS (um arquivo por modulo em
   modulos/). Aqui so se decide o que a pessoa ve, pelo cadastro dela:
   nada vem de graca — e o administrador abre tudo.
   ===================================================================== */
(() => {
  'use strict';
  const { $, $$, esc, toast, ICONES } = UI;
  window.MODULOS = window.MODULOS || {};

  const ORDEM = ['chat', 'tarefas', 'compromissos', 'chamados', 'conferencia', 'diario', 'admin'];
  const contagens = {};
  let relogioContagens = null;
  let relogioPonto = null;

  const eu = () => N.estado.eu;
  const liberados = () => ORDEM.map((k) => MODULOS[k]).filter((m) => m && m.precisa(eu()));

  /* ------------------------------------------------------------ entrar */
  const telaEntrar = $('#tela-entrar');
  const passos = { entrar: $('#form-entrar'), codigo: $('#form-codigo'), trocar: $('#form-trocar') };

  function mostrarPasso(nome) {
    $('#abrindo').hidden = true; $('#app').hidden = true; telaEntrar.hidden = false;
    for (const [k, f] of Object.entries(passos)) f.hidden = k !== nome;
    $$('.lerr').forEach((e) => { e.textContent = ''; });
    const foco = { entrar: '#usuario', codigo: '#codigo', trocar: '#nova1' }[nome];
    setTimeout(() => $(foco)?.focus(), 80);
  }

  function ocupado(form, sim) { $$('button', form).forEach((b) => { b.disabled = sim; }); }

  async function seguirDepoisDoLogin(r) {
    if (r.fator) { mostrarPasso('codigo'); return; }
    if (r.trocarSenha) { mostrarPasso('trocar'); return; }
    await montarApp();
  }

  passos.entrar.onsubmit = async (e) => {
    e.preventDefault();
    const usuario = $('#usuario').value.trim(), senha = $('#senha').value;
    if (!usuario || !senha) return;
    ocupado(passos.entrar, true); $('#erro-entrar').textContent = '';
    try { await seguirDepoisDoLogin(await N.entrar(usuario, senha)); }
    catch (err) { $('#erro-entrar').textContent = err.message; }
    finally { ocupado(passos.entrar, false); }
  };

  passos.codigo.onsubmit = async (e) => {
    e.preventDefault();
    const codigo = $('#codigo').value.replace(/\D/g, '');
    if (codigo.length !== 6) { $('#erro-codigo').textContent = 'São seis dígitos.'; return; }
    ocupado(passos.codigo, true); $('#erro-codigo').textContent = '';
    try { await seguirDepoisDoLogin(await N.completarSegundoFator(codigo)); }
    catch (err) { $('#erro-codigo').textContent = err.message; $('#codigo').select(); }
    finally { ocupado(passos.codigo, false); }
  };
  $('#codigo-cancelar').onclick = async () => { await N.sair(false); mostrarPasso('entrar'); };

  passos.trocar.onsubmit = async (e) => {
    e.preventDefault();
    const a = $('#nova1').value, b = $('#nova2').value;
    if (a.length < 8) { $('#erro-trocar').textContent = 'Use pelo menos 8 caracteres.'; return; }
    if (!/[A-Za-z]/.test(a) || !/\d/.test(a)) { $('#erro-trocar').textContent = 'Misture letras e números.'; return; }
    if (a !== b) { $('#erro-trocar').textContent = 'As duas senhas não são iguais.'; return; }
    ocupado(passos.trocar, true); $('#erro-trocar').textContent = '';
    try { await N.trocarSenha(a); toast('Senha trocada.', 'ok'); await montarApp(); }
    catch (err) { $('#erro-trocar').textContent = err.message; }
    finally { ocupado(passos.trocar, false); }
  };
  $('#trocar-desistir').onclick = async () => { await N.sair(); mostrarPasso('entrar'); };

  /* ------------------------------------------------------------ inicio */
  const telaInicio = {
    titulo: 'CMH Sistema',
    aoTopo(dir) {
      dir.innerHTML = '';
      const b = UI.botaoTopo(`<span class="avatar av-32">${esc(L.iniciais(eu().nome))}</span>`, () => UI.ir(telaPerfil()), 'Perfil');
      b.className = 'btn-icon'; b.style.border = 'none'; b.style.background = 'none';
      dir.appendChild(b);
    },
    async desenhar(el) {
      const u = eu();
      const hora = new Date().getHours();
      const saud = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
      const mods = liberados();
      el.innerHTML = `
        <div>
          <div style="font-size:22px;font-weight:800;color:var(--black);letter-spacing:-.3px">${esc(saud)}, ${esc(L.primeiroNome(u.nome))}</div>
          <div class="text-muted pequeno">${esc([u.cargo, L.setoresDe(u).join(', ')].filter(Boolean).join(' · ') || 'Clínica Medicina Humana')}</div>
        </div>
        ${mods.length ? `<div class="grade" id="grade"></div>` : `<div class="aviso atencao">Seu cadastro ainda não tem nenhum módulo liberado para o celular. Peça ao administrador do SistemaCMH para marcar Chat, Tarefas, Compromissos, Chamados, Conferência ou Diário.</div>`}
        <div class="text-muted pequeno centro" style="margin-top:auto">CMH Sistema · ${esc(CFG.versao || CFG.versaoBase)}</div>`;
      const grade = $('#grade', el);
      if (grade) {
        grade.innerHTML = mods.map((m) => `
          <button class="modulo" type="button" data-m="${esc(m.chave)}">
            <span class="modulo__icone">${m.icone}</span>
            <span><span class="modulo__nome">${esc(m.nome)}</span><br><span class="modulo__sub">${esc(m.sub || '')}</span></span>
            <span class="modulo__n ${m.calmo ? 'calmo' : ''}" data-n="${esc(m.chave)}" hidden></span>
          </button>`).join('');
        $$('.modulo', grade).forEach((b) => { b.onclick = () => MODULOS[b.dataset.m].abrir(); });
        pintarContagens();
      }
      atualizarContagens();
    },
  };

  function pintarContagens() {
    for (const [k, n] of Object.entries(contagens)) {
      $$(`.modulo__n[data-n="${CSS.escape(k)}"]`).forEach((e) => { e.hidden = !n; e.textContent = n > 99 ? '99+' : String(n); });
      UI.badgeAba(k, n);
    }
  }

  async function atualizarContagens() {
    if (document.hidden || !eu()) return;
    await Promise.all(liberados().filter((m) => m.contar).map(async (m) => {
      try { const n = await m.contar(); if (typeof n === 'number') contagens[m.chave] = n; } catch { /* sem rede: fica o anterior */ }
    }));
    pintarContagens();
  }

  /* ------------------------------------------------------------ perfil */
  function telaPerfil() {
    return {
      titulo: 'Perfil',
      async desenhar(el) {
        const u = eu();
        const nivel = await N.nivelDaSessao().catch(() => 'aal1');
        let fatores = [];
        try { fatores = await N.fatores(); } catch { /* segue */ }
        el.innerHTML = `
          <div class="card" style="display:flex;align-items:center;gap:14px">
            ${UI.avatar(u.nome, 56)}
            <div class="flex1"><div style="font-size:17px;font-weight:800;color:var(--black)">${esc(u.nome)}</div>
              <div class="text-muted pequeno">${esc([u.cargo, u.profissao && u.registro ? `${u.profissao} ${u.registro}` : u.profissao].filter(Boolean).join(' · ') || '—')}</div>
              <div class="text-muted pequeno">@${esc(u.usuario)}${u.admin ? ' · administrador' : ''}${L.setoresDe(u).length ? ' · ' + esc(L.setoresDe(u).join(', ')) : ''}</div></div>
          </div>
          <div class="lista">
            <button class="linha" type="button" id="pf-senha"><div class="linha__corpo"><div class="linha__titulo"><span class="t">Trocar minha senha</span></div></div>${ICONES.seta}</button>
            <button class="linha" type="button" id="pf-2fa"><div class="linha__corpo"><div class="linha__titulo"><span class="t">Verificação em duas etapas</span>${fatores.length ? '<span class="badge b-ok">ligada</span>' : '<span class="badge b-gray">desligada</span>'}</div>
              <div class="linha__sub">${u.admin && nivel !== 'aal2' ? 'Para administrar pelo celular, ela precisa estar ligada.' : fatores.length ? 'Código do autenticador ao entrar.' : 'Um código a mais ao entrar, do aplicativo autenticador.'}</div></div>${ICONES.seta}</button>
            <button class="linha" type="button" id="pf-tema"><div class="linha__corpo"><div class="linha__titulo"><span class="t">Cores da tela</span></div><div class="linha__sub">${UI.temaAtual() === 'dark' ? 'Escuro' : 'Claro'} · toque para trocar</div></div>${ICONES.seta}</button>
          </div>
          <button class="btn btn-ghost w-full" type="button" id="pf-sair" style="color:var(--red)">Sair da conta</button>
          <div class="text-muted pequeno centro">CMH Sistema ${esc(CFG.versao || CFG.versaoBase)} · sessão ${esc(nivel)}</div>`;
        $('#pf-senha', el).onclick = folhaTrocarSenha;
        $('#pf-2fa', el).onclick = () => folhaDuasEtapas(fatores);
        $('#pf-tema', el).onclick = () => { UI.trocarTema(); UI.redesenhar(); };
        $('#pf-sair', el).onclick = async () => {
          if (!await UI.confirmar('Sair da conta neste aparelho?', { ok: 'Sair', perigo: true })) return;
          await N.sair(); pararRelogios(); mostrarPasso('entrar');
        };
      },
    };
  }

  function folhaTrocarSenha() {
    const f = UI.folha(`<form id="ts">
      <div class="fg"><label>Senha nova</label><input id="ts1" type="password" autocomplete="new-password" minlength="8" required><div class="dica">Pelo menos 8 caracteres, com letras e números.</div></div>
      <div class="fg"><label>Repita</label><input id="ts2" type="password" autocomplete="new-password" required></div>
      <div class="modal-ft"><button class="btn btn-ok" type="submit">Salvar</button></div></form>`, { titulo: 'Trocar minha senha' });
    $('#ts', f.caixa).onsubmit = async (e) => {
      e.preventDefault();
      const a = $('#ts1', f.caixa).value, b = $('#ts2', f.caixa).value;
      if (a.length < 8 || !/[A-Za-z]/.test(a) || !/\d/.test(a)) return toast('Use 8+ caracteres, com letras e números.', 'err');
      if (a !== b) return toast('As duas senhas não são iguais.', 'err');
      try { await N.trocarSenha(a); toast('Senha trocada.', 'ok'); f.fechar(); } catch (err) { toast(err.message, 'err'); }
    };
  }

  function folhaDuasEtapas(fatores) {
    if (fatores.length) {
      const f = UI.folha(`<p style="line-height:1.5">A verificação em duas etapas está <b>ligada</b>. Ao entrar, o app pede o código do seu aplicativo autenticador.</p>
        <div class="modal-ft"><button class="btn btn-danger" id="de-off" type="button">Desligar</button></div>`, { titulo: 'Duas etapas' });
      $('#de-off', f.caixa).onclick = async () => {
        if (!await UI.confirmar('Desligar a verificação em duas etapas? Se você é administrador, vai deixar de administrar até religar.', { ok: 'Desligar', perigo: true })) return;
        try { for (const x of fatores) await N.desligarSegundoFator(x.id); toast('Desligada.', 'ok'); f.fechar(); UI.redesenhar(); }
        catch (err) { toast(err.message, 'err'); }
      };
      return;
    }
    const f = UI.folha(`<div id="de-corpo"><p class="text-muted">Preparando…</p></div>`, { titulo: 'Ligar as duas etapas' });
    (async () => {
      try {
        const { id, segredo, uri } = await N.ligarSegundoFator();
        let qrHtml = '';
        try { const q = qrcode(0, 'M'); q.addData(uri); q.make(); qrHtml = q.createImgTag(4, 8); } catch { /* sem QR */ }
        $('#de-corpo', f.caixa).innerHTML = `
          <p style="line-height:1.5">1. Abra o <b>Google Authenticator</b> ou o <b>Microsoft Authenticator</b> neste mesmo aparelho e toque em <b>Abrir no autenticador</b>. Se preferir outro aparelho, leia o QR ou digite a chave.</p>
          <a class="btn btn-primary mt8" href="${esc(uri)}">Abrir no autenticador</a>
          <div class="qr">${qrHtml}</div>
          <div class="codigo-secreto">${esc(segredo)}</div>
          <form id="de-form" class="mt16"><p style="line-height:1.5">2. Digite o código de seis dígitos que apareceu lá:</p>
            <div class="fg"><input id="de-cod" inputmode="numeric" maxlength="6" autocomplete="one-time-code" required></div>
            <div class="modal-ft"><button class="btn btn-ok" type="submit">Confirmar e ligar</button></div></form>`;
        $('#de-form', f.caixa).onsubmit = async (e) => {
          e.preventDefault();
          try { await N.confirmarSegundoFator(id, $('#de-cod', f.caixa).value); toast('Duas etapas ligadas. Ao entrar de novo, o app vai pedir o código.', 'ok', 5000); f.fechar(); UI.redesenhar(); }
          catch (err) { toast(err.message, 'err'); }
        };
      } catch (err) { $('#de-corpo', f.caixa).innerHTML = `<div class="aviso erro">${esc(err.message)}</div>`; }
    })();
  }

  /* ------------------------------------------------------------- abas */
  function folhaMais() {
    const mods = liberados().filter((m) => !['chat', 'tarefas'].includes(m.chave));
    const f = UI.folha(`<div class="lista" style="border:none">
      ${mods.map((m) => `<button class="linha" type="button" data-m="${esc(m.chave)}"><span class="modulo__icone">${m.icone}</span><div class="linha__corpo"><div class="linha__titulo"><span class="t">${esc(m.nome)}</span>${contagens[m.chave] ? `<span class="chat-badge">${contagens[m.chave]}</span>` : ''}</div><div class="linha__sub">${esc(m.sub || '')}</div></div>${ICONES.seta}</button>`).join('')}
      <button class="linha" type="button" data-m="perfil"><span class="modulo__icone">${ICONES.perfil}</span><div class="linha__corpo"><div class="linha__titulo"><span class="t">Perfil</span></div><div class="linha__sub">Senha, duas etapas, cores, sair</div></div>${ICONES.seta}</button>
    </div>`, { titulo: 'Mais' });
    $$('.linha', f.caixa).forEach((b) => { b.onclick = () => { f.fechar(); b.dataset.m === 'perfil' ? UI.ir(telaPerfil()) : MODULOS[b.dataset.m].abrir(); }; });
  }

  function montarAbas() {
    const lista = [{ chave: 'inicio', rotulo: 'Início', icone: ICONES.inicio, abrir: () => UI.raiz(telaInicio, 'inicio') }];
    for (const k of ['chat', 'tarefas']) {
      const m = MODULOS[k];
      if (m && m.precisa(eu())) lista.push({ chave: k, rotulo: m.nome, icone: m.icone, abrir: () => m.abrir(true) });
    }
    lista.push({ chave: 'mais', rotulo: 'Mais', icone: ICONES.mais, abrir: folhaMais });
    UI.montarAbas(lista);
  }

  /* --------------------------------------------------------- relogios */
  function pararRelogios() { clearInterval(relogioContagens); clearInterval(relogioPonto); }
  function ligarRelogios() {
    pararRelogios();
    relogioContagens = setInterval(atualizarContagens, 30000);
    relogioPonto = setInterval(() => { if (!document.hidden && eu()) N.sb.rpc('orc_marcar_acesso').then(() => {}, () => {}); }, 120000);
  }
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden || !eu()) return;
    await N.recarregarUsuario();
    if (!eu()) { pararRelogios(); mostrarPasso('entrar'); toast('Seu acesso foi encerrado.', 'err'); return; }
    N.sb.rpc('orc_marcar_acesso').then(() => {}, () => {});
    atualizarContagens();
  });

  /* ------------------------------------------------------------- boot */
  async function montarApp() {
    telaEntrar.hidden = true; $('#abrindo').hidden = true; $('#app').hidden = false;
    montarAbas();
    ligarRelogios();
    await UI.raiz(telaInicio, 'inicio');
  }

  async function boot() {
    try {
      const SB = window.Capacitor?.Plugins?.StatusBar;
      if (SB) SB.setStyle({ style: UI.temaAtual() === 'dark' ? 'DARK' : 'LIGHT' }).catch(() => {});
    } catch { /* sem plugin */ }
    try {
      const r = await N.restaurar();
      if (r && r.fator) { mostrarPasso('codigo'); return; }
      if (r && r.offline) { toast(N.recado({ message: 'network' }), 'err'); mostrarPasso('entrar'); return; }
      if (r && r.ok) { if (r.trocarSenha) mostrarPasso('trocar'); else await montarApp(); return; }
    } catch (e) { console.error(e); }
    mostrarPasso('entrar');
  }

  window.APP = { telaInicio, telaPerfil, atualizarContagens, contagens, mostrarPasso, eu };
  boot();
})();
