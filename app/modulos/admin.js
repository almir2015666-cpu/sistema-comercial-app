/* =====================================================================
   Administracao — usuarios, log e maquinas. So para o administrador, e so
   com a verificacao em duas etapas na sessao: sem aal2 a RLS trata o
   administrador como usuario comum, e a tela avisa em vez de "sumir".
   Criar acesso, senha nova, bloquear e liberar passam pela Edge Function,
   porque a chave de servico nunca vem para o aparelho.
   ===================================================================== */
(() => {
  'use strict';
  const { $, $$, esc, toast, ICONES } = UI;
  const eu = () => N.estado.eu;
  const CAMPOS = 'id,usuario,nome,cargo,profissao,registro,setor,admin,ativo,trocar_senha,ultimo_acesso,criado_em,modulos';

  async function exigirDuasEtapas(el) {
    const nivel = await N.nivelDaSessao();
    if (nivel === 'aal2') return true;
    el.innerHTML = `<div class="aviso atencao">Para administrar pelo celular, sua sessão precisa da <b>verificação em duas etapas</b>. Ligue em Perfil, saia e entre de novo com o código.</div>
      <button class="btn btn-primary" id="ad-perfil" type="button">Ir ao Perfil</button>`;
    $('#ad-perfil', el).onclick = () => UI.ir(APP.telaPerfil());
    return false;
  }

  const tela = {
    titulo: 'Administração',
    async desenhar(el) {
      if (!await exigirDuasEtapas(el)) return;
      el.innerHTML = `<div class="lista">
        <button class="linha" type="button" id="ad-usuarios"><span class="modulo__icone">${ICONES.perfil}</span><div class="linha__corpo"><div class="linha__titulo"><span class="t">Usuários</span></div><div class="linha__sub">Acessos, módulos, setores, senhas</div></div>${ICONES.seta}</button>
        <button class="linha" type="button" id="ad-log"><span class="modulo__icone">${ICONES.conferencia}</span><div class="linha__corpo"><div class="linha__titulo"><span class="t">Log</span></div><div class="linha__sub">Quem fez o quê, os últimos 500</div></div>${ICONES.seta}</button>
        <button class="linha" type="button" id="ad-maq"><span class="modulo__icone">${ICONES.chamados}</span><div class="linha__corpo"><div class="linha__titulo"><span class="t">Máquinas e versões</span></div><div class="linha__sub">De onde a equipe entra, e com que versão</div></div>${ICONES.seta}</button>
      </div>
      <div class="text-muted pequeno">Backup, lixeira, módulos em desenvolvimento e as cores do sistema continuam no programa do computador.</div>`;
      $('#ad-usuarios', el).onclick = () => UI.ir(telaUsuarios);
      $('#ad-log', el).onclick = () => UI.ir(telaLog);
      $('#ad-maq', el).onclick = () => UI.ir(telaMaquinas);
    },
  };

  /* --------------------------------------------------------- usuarios */
  const telaUsuarios = {
    titulo: 'Usuários',
    aoTopo(dir) { dir.innerHTML = ''; dir.appendChild(UI.botaoTopo(ICONES.mais_circ, () => ficha(null), 'Criar acesso')); },
    async desenhar(el) {
      const { data, error } = await N.sb.from('orc_usuarios').select(CAMPOS).order('nome');
      if (error) throw error;
      const lista = data || [];
      if (lista.length <= 1) el.innerHTML = `<div class="aviso atencao">Só o seu cadastro veio. Se você é administrador, confira se entrou com o código das duas etapas.</div>`;
      el.innerHTML += `<div class="lista">${lista.map((u) => `<button class="linha" type="button" data-u="${esc(u.usuario)}">${UI.avatar(u.nome, 40, L.estaAgora(u.ultimo_acesso))}<div class="linha__corpo"><div class="linha__titulo"><span class="t ${u.ativo ? '' : 'text-muted'}">${esc(u.nome)}</span>${u.admin ? '<span class="badge b-1">admin</span>' : ''}${u.ativo ? '' : '<span class="badge b-err">bloqueado</span>'}${u.trocar_senha ? '<span class="badge b-4">senha provisória</span>' : ''}</div><div class="linha__sub">@${esc(u.usuario)}${u.cargo ? ` · ${esc(u.cargo)}` : ''}${u.setor ? ` · ${esc(u.setor)}` : ''}</div></div>${ICONES.seta}</button>`).join('')}</div>`;
      $$('.linha', el).forEach((b) => { b.onclick = () => ficha(lista.find((u) => u.usuario === b.dataset.u)); });
    },
  };

  function ficha(u) {
    const novo = !u;
    const marcados = new Set(u?.modulos || []);
    const setores = new Set(L.setoresDe(u));
    const souEu = u && u.id === eu().id;
    const f = UI.folha(`<form id="uf">
      <div class="row-2"><div class="fg"><label>Usuário (login)</label><input id="uf-usuario" autocapitalize="none" autocorrect="off" value="${esc(u?.usuario || '')}" ${novo ? 'required' : ''}></div>
      <div class="fg"><label>Nome</label><input id="uf-nome" required value="${esc(u?.nome || '')}"></div></div>
      <div class="fg"><label>Cargo</label><input id="uf-cargo" list="uf-cargos" value="${esc(u?.cargo || '')}"><datalist id="uf-cargos">${L.CARGOS.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></div>
      <div class="row-2"><div class="fg"><label>Profissão</label><input id="uf-prof" value="${esc(u?.profissao || '')}"></div><div class="fg"><label>Registro (CRM…)</label><input id="uf-reg" value="${esc(u?.registro || '')}"></div></div>
      <label class="visto"><input type="checkbox" id="uf-admin" ${u?.admin ? 'checked' : ''} ${souEu ? 'disabled' : ''}> Administrador (abre tudo)</label>
      <div class="secao">Setor (onde trabalha)</div><div class="vistos mb12">${L.SETORES.map((s) => `<button type="button" class="chip ${setores.has(s) ? 'on' : ''}" data-set="${esc(s)}">${esc(s)}</button>`).join('')}</div>
      <div class="secao">Módulos</div><div class="lista-vistos">${L.MODULOS.map(([k, n]) => `<label class="visto"><input type="checkbox" data-mod="${k}" ${marcados.has(k) ? 'checked' : ''}> ${esc(n)}${L.NO_CELULAR.includes(k) ? ' <span class="badge b-3">celular</span>' : ''}</label>`).join('')}</div>
      <div class="secao">Botões</div><div class="lista-vistos">${L.BOTOES.map(([k, n]) => `<label class="visto"><input type="checkbox" data-mod="${k}" ${marcados.has(k) ? 'checked' : ''}> ${esc(n)}${k === 'conferencia' ? ' <span class="badge b-3">celular</span>' : ''}</label>`).join('')}</div>
      <div class="secao">Dentro dos módulos</div><div class="lista-vistos">${L.DENTRO.map(([k, , n]) => `<label class="visto"><input type="checkbox" data-mod="${k}" ${marcados.has(k) ? 'checked' : ''}> ${esc(n)}</label>`).join('')}</div>
      <div class="modal-ft"><button class="btn btn-ok" type="submit">${novo ? 'Criar acesso' : 'Salvar'}</button></div>
      ${novo ? '' : `<div class="acoes mt12"><button class="btn btn-ghost" type="button" id="uf-senha">Nova senha</button>${souEu ? '' : `<button class="btn btn-ghost" type="button" id="uf-bloq" style="color:${u.ativo ? 'var(--red)' : 'var(--green)'}">${u.ativo ? 'Bloquear acesso' : 'Liberar acesso'}</button>`}</div>`}
    </form>`, { titulo: novo ? 'Criar acesso' : u.nome });
    $$('[data-set]', f.caixa).forEach((b) => { b.onclick = () => { b.classList.toggle('on'); setores.has(b.dataset.set) ? setores.delete(b.dataset.set) : setores.add(b.dataset.set); }; });

    $('#uf', f.caixa).onsubmit = async (e) => {
      e.preventDefault();
      const usuario = L.loginDe($('#uf-usuario', f.caixa).value), nome = L.achatar($('#uf-nome', f.caixa).value);
      const cargo = L.achatar($('#uf-cargo', f.caixa).value), profissao = L.achatar($('#uf-prof', f.caixa).value), registro = L.achatar($('#uf-reg', f.caixa).value);
      const admin = $('#uf-admin', f.caixa).checked;
      const mods = $$('input[data-mod]:checked', f.caixa).map((i) => i.dataset.mod).filter((k) => !k.includes(':') || $$('input[data-mod]:checked', f.caixa).some((i) => i.dataset.mod === k.split(':')[0]));
      if (!usuario || !nome) return toast('Usuário e nome são obrigatórios.', 'err');
      if (!admin && !mods.length) return toast('Marque pelo menos um módulo. Para tirar o acesso por completo, use Bloquear.', 'err');
      UI.carregando(true, novo ? 'Criando o acesso…' : 'Salvando…');
      try {
        if (novo) {
          const r = await N.funcao({ acao: 'criar', usuario, nome, cargo, admin });
          await N.sb.from('orc_usuarios').update({ modulos: mods, setor: [...setores].join(', ') || null, profissao: profissao || null, registro: registro || null }).eq('usuario', r.usuario);
          UI.carregando(false); f.fechar(); UI.redesenhar();
          UI.folha(`<p style="line-height:1.5">Acesso criado. Passe a senha provisória para <b>${esc(nome)}</b>; o app pede uma senha nova na primeira entrada.</p><div class="codigo-secreto mt12" style="font-size:20px">${esc(r.senha)}</div><div class="text-muted pequeno mt8">usuário: <b>${esc(r.usuario)}</b></div>`, { titulo: 'Senha provisória' });
          return;
        }
        const corpo = { acao: 'editar', usuario: u.usuario, nome, cargo, admin };
        if (usuario !== u.usuario) { if (!await UI.confirmar(`Trocar o login de "${u.usuario}" para "${usuario}"? A pessoa passa a entrar com o novo.`, { ok: 'Trocar' })) { UI.carregando(false); return; } corpo.novo_usuario = usuario; }
        const r = await N.funcao(corpo);
        const login = r.usuario || u.usuario;
        if (!admin) { await N.sb.from('orc_usuarios').update({ modulos: mods }).eq('usuario', login); N.registrar('modulos_alterados', `${login}: ${mods.join(', ')}`); }
        const setorNovo = [...setores].join(', ') || null;
        if (setorNovo !== (u.setor || null)) { await N.sb.from('orc_usuarios').update({ setor: setorNovo }).eq('usuario', login); N.registrar('setor_alterado', `${login}: ${u.setor || '—'} → ${setorNovo || '—'}`); }
        await N.sb.from('orc_usuarios').update({ profissao: profissao || null, registro: registro || null }).eq('usuario', login);
        UI.carregando(false); toast('Salvo.', 'ok'); f.fechar(); UI.redesenhar();
      } catch (err) { UI.carregando(false); toast(err.message, 'err', 5000); }
    };
    const bs = $('#uf-senha', f.caixa); if (bs) bs.onclick = async () => {
      if (!await UI.confirmar(`Gerar uma senha nova para ${u.nome}? A atual deixa de valer.`, { ok: 'Gerar' })) return;
      try { const r = await N.funcao({ acao: 'senha', usuario: u.usuario }); UI.folha(`<p>Senha provisória de <b>${esc(u.nome)}</b>. O app pede para trocar na primeira entrada.</p><div class="codigo-secreto mt12" style="font-size:20px">${esc(r.senha)}</div>`, { titulo: 'Nova senha' }); }
      catch (e) { toast(e.message, 'err'); }
    };
    const bb = $('#uf-bloq', f.caixa); if (bb) bb.onclick = async () => {
      const bloquear = u.ativo;
      if (!await UI.confirmar(bloquear ? `Bloquear o acesso de ${u.nome}? Vale na hora, no computador e no celular.` : `Liberar o acesso de ${u.nome}?`, { ok: bloquear ? 'Bloquear' : 'Liberar', perigo: bloquear })) return;
      try { await N.funcao({ acao: bloquear ? 'bloquear' : 'liberar', usuario: u.usuario }); toast(bloquear ? 'Bloqueado.' : 'Liberado.', 'ok'); f.fechar(); UI.redesenhar(); }
      catch (e) { toast(e.message, 'err'); }
    };
  }

  /* -------------------------------------------------------------- log */
  const ACOES = {
    entrou: 'entrou', saiu: 'saiu', login_falhou: 'login falhou', usuario_criado: 'criou acesso', senha_redefinida: 'redefiniu senha', senha_trocada: 'trocou a própria senha',
    acesso_bloqueado: 'bloqueou acesso', acesso_liberado: 'liberou acesso', modulos_alterados: 'mudou módulos', setor_alterado: 'mudou setor', cadastro_alterado: 'alterou cadastro',
    segundo_fator_ligado: 'ligou duas etapas', segundo_fator_desligado: 'desligou duas etapas', funcao_falhou: 'função falhou',
    conferencia_aberta: 'abriu conferência', conferencia_novo: 'novo serviço', conferencia_alterou: 'alterou serviço', conferencia_importou: 'importou planilha', conferencia_pgr_liberado: 'liberou PGR', conferencia_exportou: 'exportou conferência',
    diario_aberto: 'abriu diário', diario_registrado: 'lançou no diário', diario_apagado: 'apagou do diário', diario_metas_alteradas: 'mudou metas',
    tarefa_criada: 'criou tarefa', tarefa_alterada: 'alterou tarefa', tarefa_concluida: 'concluiu tarefa', tarefa_itens: 'mexeu no checklist', tarefa_apagada: 'apagou tarefa',
    compromisso_marcado: 'marcou compromisso', compromisso_mudado: 'mudou compromisso', compromisso_cancelado: 'cancelou compromisso', compromisso_apagado: 'apagou compromisso',
    chamado_aberto: 'abriu chamado', chamado_atendido: 'atendeu chamado', chamado_resolvido: 'resolveu chamado', chamado_pendente: 'chamado pendente', chamado_devolvido: 'devolveu chamado', chamado_cancelado: 'cancelou chamado', chamado_corrigido: 'corrigiu chamado',
  };
  const LEITURAS = new Set(['entrou', 'saiu', 'login_falhou', 'conferencia_aberta', 'diario_aberto']);

  const telaLog = {
    titulo: 'Log',
    async desenhar(el) {
      const { data, error } = await N.sb.from('orc_log').select('quando,usuario_login,usuario_nome,acao,detalhe,maquina,app_versao').order('quando', { ascending: false }).limit(500);
      if (error) throw error;
      const linhas = data || [];
      let busca = '', soAcessos = false;
      const pintar = () => {
        const t = L.semAcento(busca).toLowerCase();
        const vis = linhas.filter((l) => (!soAcessos || LEITURAS.has(l.acao)) && (!t || L.semAcento([l.usuario_nome, l.usuario_login, ACOES[l.acao] || l.acao, l.detalhe, l.maquina].join(' ')).toLowerCase().includes(t)));
        $('#lg-corpo', el).innerHTML = vis.length ? `<div class="lista">${vis.slice(0, 300).map((l) => `<div class="linha"><div class="linha__corpo"><div class="linha__titulo"><span class="t">${esc(l.usuario_nome || l.usuario_login || '?')}</span><span class="badge ${l.acao === 'login_falhou' ? 'b-err' : 'b-gray'}">${esc(ACOES[l.acao] || l.acao)}</span></div><div class="linha__sub">${esc(L.dataHoraBr(l.quando))}${l.maquina ? ` · ${esc(l.maquina)}` : ''}${l.app_versao ? ` · ${esc(l.app_versao)}` : ''}</div>${l.detalhe ? `<div class="linha__sub" style="white-space:normal">${esc(l.detalhe)}</div>` : ''}</div></div>`).join('')}</div>` : UI.vazio('Nada com esse filtro');
      };
      el.innerHTML = `<div class="busca">${ICONES.busca}<input id="lg-busca" placeholder="Pessoa, ação, detalhe…"></div><label class="visto"><input type="checkbox" id="lg-acessos"> Só os acessos (quem entrou e saiu)</label><div id="lg-corpo"></div>`;
      let tm; $('#lg-busca', el).oninput = (e) => { clearTimeout(tm); tm = setTimeout(() => { busca = e.target.value; pintar(); }, 250); };
      $('#lg-acessos', el).onchange = (e) => { soAcessos = e.target.checked; pintar(); };
      pintar();
    },
  };

  /* --------------------------------------------------------- maquinas */
  const telaMaquinas = {
    titulo: 'Máquinas e versões',
    async desenhar(el) {
      const linhas = await N.tudo((de, ate) => N.sb.from('orc_log').select('quando,usuario_nome,maquina,app_versao,usuario_windows').eq('acao', 'entrou').order('quando', { ascending: false }).range(de, ate), 3000);
      const por = new Map();
      for (const l of linhas) { const k = l.maquina || '(sem nome)'; const m = por.get(k) || { maquina: k, versao: l.app_versao, quando: l.quando, quem: l.usuario_nome, windows: l.usuario_windows, aberturas: 0 }; m.aberturas++; por.set(k, m); }
      const { data: cfg } = await N.sb.from('orc_config').select('valor').eq('chave', 'versao_programa').limit(1);
      let publicada = ''; try { publicada = JSON.parse(cfg?.[0]?.valor || '{}').versao || ''; } catch { /* sem versao */ }
      const lista = [...por.values()];
      el.innerHTML = `<div class="text-muted pequeno">${lista.length} máquinas nos últimos ${linhas.length} acessos${publicada ? ` · versão publicada do programa: <b>${esc(publicada)}</b>` : ''}. Celulares aparecem com "app".</div>
        <div class="lista">${lista.map((m) => { const app = /^app /.test(m.versao || ''); const velha = !app && publicada && m.versao && m.versao !== publicada; return `<div class="linha"><div class="linha__corpo"><div class="linha__titulo"><span class="t">${esc(m.maquina)}</span><span class="badge ${app ? 'b-3' : velha ? 'b-err' : 'b-ok'}">${esc(m.versao || '?')}</span></div><div class="linha__sub">${esc(m.quem || '?')} · ${esc(L.dataHoraBr(m.quando))} · ${m.aberturas} aberturas${m.windows && m.windows !== 'app' ? ` · ${esc(m.windows)}` : ''}</div></div></div>`; }).join('')}</div>`;
    },
  };

  MODULOS.admin = {
    chave: 'admin', nome: 'Administração', sub: 'Usuários, log, máquinas', icone: ICONES.admin,
    precisa: (u) => !!u?.admin,
    abrir: () => UI.ir(tela),
  };
})();
