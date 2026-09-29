/* =====================================================================
   Chamados T.I. — fila por ordem de chegada, sem prioridade de proposito.
   Quem abriu corrige ou cancela enquanto esta na fila; atender, pendente,
   resolver e devolver e do T.I. (e do administrador). O gatilho do banco
   e quem recusa, com a frase em portugues.
   ===================================================================== */
(() => {
  'use strict';
  const { $, $$, esc, toast, ICONES } = UI;
  const CAMPOS = 'id,de,de_nome,de_setor,maquina,telefone,tipo,descricao,situacao,atendente,atendente_nome,atendendo_desde,resolvido_em,resposta,pendencia,pendente_desde,criado_em,atualizado_em';
  const eu = () => N.estado.eu;
  const SELO = { aberto: 'b-1', atendendo: 'b-3', pendente: 'b-4', resolvido: 'b-ok', cancelado: 'b-gray' };

  // Os periodos do historico, os mesmos da janela do computador
  // (chamados_tela.py, JanelaHistorico.PERIODOS). 0 = tudo o que existe:
  // e o que responde "isso ja quebrou antes?" quando o antes e de dois anos.
  // O padrao e 6 meses, como la.
  const PERIODOS = [[90, '90 dias'], [180, '6 meses'], [365, '1 ano'], [0, 'Tudo']];
  const PERIODO_PADRAO = 180;

  async function listar(modo, dias = PERIODO_PADRAO) {
    return N.tudo((de, ate) => {
      let q = N.sb.from('orc_chamados').select(CAMPOS);
      if (modo === 'historico') {
        q = q.in('situacao', ['resolvido', 'cancelado']);
        if (dias) q = q.gte('atualizado_em', L.somarDias(L.hojeISO(), -dias));
        q = q.order('atualizado_em', { ascending: false });
      } else q = q.in('situacao', L.VIVAS).order('id', { ascending: true });
      return q.range(de, ate);
    });
  }

  // "há 5 min", "há 2 h", "há 3 dias": o mesmo texto da coluna de espera
  // da fila do computador (chamados_nucleo.py, espera), para o T.I. ler o
  // mesmo numero nos dois lugares.
  function espera(iso, agora = new Date()) {
    if (!iso) return '';
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return '';
    const min = Math.max(0, Math.floor((agora.getTime() - t) / 60000));
    if (min < 1) return 'agora';
    if (min < 60) return `há ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) { const r = min % 60; return `há ${h} h${r && h < 6 ? ` ${r} min` : ''}`; }
    const d = Math.floor(h / 24);
    return `há ${d} dia${d > 1 ? 's' : ''}`;
  }

  // [[valor, vezes]] do campo, do mais repetido para o menos, desempate
  // pelo nome (chamados_nucleo.py, mais_frequentes). Vazio nao conta:
  // maquina em branco nao e uma maquina que quebra sempre.
  function maisFrequentes(lista, campo, quantos = 3) {
    const conta = new Map();
    for (const c of lista) {
      const v = String(c[campo] ?? '').trim();
      if (v) conta.set(v, (conta.get(v) || 0) + 1);
    }
    const ord = [...conta.entries()].sort((a, b) => b[1] - a[1] || a[0].toLowerCase().localeCompare(b[0].toLowerCase(), 'pt-BR'));
    return quantos ? ord.slice(0, quantos) : ord;
  }

  // A frase de cima do historico: quantos, o que mais aparece e onde mais
  // da trabalho. E esse numero que muda uma decisao (trocar o cartucho pela
  // quarta vez ou trocar a impressora). Mesmo texto do computador.
  function resumo(achados, busca) {
    if (!achados.length) return `Nenhum serviço fechado neste período${busca.trim() ? ' com o que você procurou.' : '.'}`;
    const partes = [`${achados.length} serviço(s) fechado(s)`];
    const tipos = maisFrequentes(achados, 'tipo', 3);
    if (tipos.length) partes.push(`o que mais aparece: ${tipos.map(([t, q]) => `${t} (${q})`).join(', ')}`);
    // uma maquina que apareceu uma vez so nao e noticia
    const maquinas = maisFrequentes(achados, 'maquina', 2).filter(([, q]) => q > 1);
    if (maquinas.length) partes.push(`computador que mais dá trabalho: ${maquinas.map(([m, q]) => `${m} (${q})`).join(', ')}`);
    return partes.join(' · ');
  }

  // Marca "ja fui avisado ate aqui": nunca atrasa.
  async function marcarAvisado() {
    try {
      const { data } = await N.sb.from('orc_chamado_visto').select('ate').eq('usuario', eu().id);
      const agora = new Date().toISOString();
      if (!data?.length || data[0].ate < agora) await N.sb.from('orc_chamado_visto').upsert({ usuario: eu().id, ate: agora }, { onConflict: 'usuario' });
    } catch { /* silencioso */ }
  }

  const tela = {
    titulo: 'Chamados T.I.',
    aoTopo(dir) { dir.innerHTML = ''; dir.appendChild(UI.botaoTopo(ICONES.mais_circ, () => abrirChamado(), 'Abrir chamado')); },
    async desenhar(el) {
      const veFila = L.veAFila(eu());
      let modo = veFila ? 'fila' : 'meus', vivo = true, busca = '', dias = PERIODO_PADRAO;
      // O historico e consulta, nao fila: fica guardado enquanto a pessoa
      // procura, em vez de baixar "Tudo" de novo a cada letra digitada.
      let hist = null;
      marcarAvisado();
      const desenharLista = async (forcar = true) => {
        if (!vivo) return;
        try {
          const ehHist = modo === 'historico';
          let lista;
          if (ehHist) {
            if (forcar || !hist || hist.dias !== dias) hist = { dias, lista: await listar('historico', dias) };
            lista = L.ordenarChamados(hist.lista.slice());
          } else lista = L.ordenarChamados(await listar('vivos'));
          if (modo === 'meus') lista = lista.filter((c) => c.de === eu().id);
          if (busca) lista = L.filtrarChamados(lista, busca);
          if (veFila && !ehHist) APP.contagens.chamados = lista.filter((c) => c.situacao === 'aberto' && c.de !== eu().id).length;
          const agora = new Date();
          el.innerHTML = `<div class="tabs">${veFila ? `<button class="tab ${modo === 'fila' ? 'on' : ''}" data-v="fila">Fila</button>` : ''}<button class="tab ${modo === 'meus' ? 'on' : ''}" data-v="meus">Meus</button><button class="tab ${ehHist ? 'on' : ''}" data-v="historico">Histórico</button></div>
            ${ehHist ? `<div class="chips mt12">${PERIODOS.map(([d, r]) => `<button class="chip ${d === dias ? 'on' : ''}" type="button" data-dias="${d}">${r}</button>`).join('')}</div>` : ''}
            <div class="busca">${ICONES.busca}<input id="ch-busca" placeholder="Procurar" value="${esc(busca)}"></div>
            ${ehHist && lista.length ? `<div class="aviso info mt12">${esc(resumo(lista, busca))}</div>` : ''}
            ${lista.length ? `<div class="lista">${lista.map((c) => `<button class="linha" type="button" data-id="${c.id}">
              ${c._fila ? `<span class="avatar av-40" style="background:var(--navy)">${c._fila}º</span>` : UI.avatar(c.de_nome, 40)}
              <div class="linha__corpo"><div class="linha__titulo"><span class="t">${esc(c.tipo)}</span><span class="badge ${SELO[c.situacao]}">${esc(L.ROTULO_CHAMADO[c.situacao])}</span></div>
              <div class="linha__sub">${esc(c.de_nome)}${c.de_setor ? ` · ${esc(c.de_setor)}` : ''} · ${esc(UI.quando(c.criado_em))}${L.VIVAS.includes(c.situacao) ? ` (${esc(espera(c.criado_em, agora))})` : ''}${c.atendente_nome ? ` · ${esc(L.primeiroNome(c.atendente_nome))}` : ''}</div>
              <div class="linha__sub">${esc(c.descricao)}</div></div>${ICONES.seta}</button>`).join('')}</div>` : UI.vazio(ehHist ? resumo(lista, busca) : 'Nenhum chamado aberto', modo === 'meus' ? 'Toque em + para abrir um.' : '')}`;
          $$('.tab', el).forEach((b) => { b.onclick = () => { modo = b.dataset.v; desenharLista(); }; });
          $$('.chip[data-dias]', el).forEach((b) => { b.onclick = () => { dias = Number(b.dataset.dias); desenharLista(); }; });
          const inp = $('#ch-busca', el);
          let t; inp.oninput = () => { clearTimeout(t); t = setTimeout(() => { busca = inp.value; const pos = inp.selectionStart; desenharLista(false).then(() => { const i2 = $('#ch-busca', el); i2.focus(); i2.setSelectionRange(pos, pos); }); }, 350); };
          $$('.linha', el).forEach((b) => { b.onclick = () => detalhe(lista.find((c) => c.id === Number(b.dataset.id)), desenharLista); });
        } catch (e) { if (vivo) el.innerHTML = `<div class="aviso erro">${esc(N.recado(e))}</div>`; }
      };
      await desenharLista();
      // O historico nao se refaz sozinho, como a janela dele no computador:
      // baixar "Tudo" a cada 15 s seria custo sem ganho para uma consulta.
      const relogio = setInterval(() => { if (!document.hidden && !busca && modo !== 'historico') desenharLista(); }, 15000);
      tela._recarregar = desenharLista;
      return () => { vivo = false; clearInterval(relogio); tela._recarregar = null; };
    },
  };

  function detalhe(c, depois) {
    const ti = L.veAFila(eu());
    const meu = c.de === eu().id;
    const viva = L.VIVAS.includes(c.situacao);
    const f = UI.folha(`
      <div><span class="badge ${SELO[c.situacao]}">${esc(L.ROTULO_CHAMADO[c.situacao])}</span>${c._fila ? ` <span class="badge b-gray">${c._fila}º da fila</span>` : ''}</div>
      <p class="mt12" style="white-space:pre-wrap;line-height:1.5">${esc(c.descricao)}</p>
      <dl class="ficha mt12">
        <div><dt>Quem abriu</dt><dd>${esc(c.de_nome)}${c.de_setor ? ` · ${esc(c.de_setor)}` : ''}</dd></div>
        <div><dt>Telefone</dt><dd>${c.telefone ? `<a href="tel:${esc(c.telefone.replace(/\D/g, ''))}">${esc(c.telefone)}</a>` : 'não informado'}</dd></div>
        <div><dt>Computador</dt><dd>${esc(c.maquina || 'não informado')}</dd></div>
        <div><dt>Aberto em</dt><dd>${esc(L.dataHoraBr(c.criado_em))}${viva ? ` (${esc(espera(c.criado_em))})` : ''}</dd></div>
        ${c.atendente_nome ? `<div><dt>Atendente</dt><dd>${esc(c.atendente_nome)}${viva && c.atendendo_desde ? ` · ${esc(espera(c.atendendo_desde))}` : ''}</dd></div>` : ''}
        ${c.pendencia ? `<div class="largo"><dt>Pendente${c.situacao === 'pendente' && c.pendente_desde ? ` ${esc(espera(c.pendente_desde))}` : ''}</dt><dd>${esc(c.pendencia)}</dd></div>` : ''}
        ${c.resposta ? `<div class="largo"><dt>O que o T.I. fez</dt><dd style="white-space:pre-wrap">${esc(c.resposta)}</dd></div>` : ''}
      </dl>
      <div class="acoes mt16">
        ${ti && c.situacao === 'aberto' ? `<button class="btn btn-ok" id="cd-atender" type="button">Atender</button>` : ''}
        ${ti && ['atendendo', 'pendente'].includes(c.situacao) ? `<button class="btn btn-ok" id="cd-resolver" type="button">Resolver</button>` : ''}
        ${ti && c.situacao === 'atendendo' ? `<button class="btn btn-ghost" id="cd-pendente" type="button">Pendente</button>` : ''}
        ${ti && ['atendendo', 'pendente'].includes(c.situacao) ? `<button class="btn btn-ghost" id="cd-devolver" type="button">Devolver à fila</button>` : ''}
        ${meu && c.situacao === 'aberto' ? `<button class="btn btn-ghost" id="cd-corrigir" type="button">Corrigir</button><button class="btn btn-ghost" id="cd-cancelar" type="button">Cancelar</button>` : ''}
      </div>`, { titulo: c.tipo });
    const mudar = async (corpo, acao, texto) => {
      try { await N.mudar('orc_chamados', { id: c.id }, corpo); N.registrar(acao, `#${c.id} ${c.tipo}`); toast(texto, 'ok'); f.fechar(); depois(); }
      catch (e) { toast(N.recado(e, 'Ou o chamado não é seu, ou ele já foi pego pelo T.I.'), 'err'); }
    };
    const on = (id, fn) => { const b = $(id, f.caixa); if (b) b.onclick = fn; };
    on('#cd-atender', () => mudar({ situacao: 'atendendo' }, 'chamado_atendido', 'Você está atendendo.'));
    on('#cd-resolver', async () => { const r = await UI.perguntar('O que foi feito?', { multilinha: true, obrigatorio: false, ok: 'Resolver' }); if (r !== null) mudar({ situacao: 'resolvido', resposta: r || null }, 'chamado_resolvido', 'Resolvido.'); });
    on('#cd-pendente', async () => { const p = await UI.perguntar('O que está pendente?', { multilinha: true, ok: 'Marcar pendente', placeholder: 'É isso que quem abriu vai ler.' }); if (p) mudar({ situacao: 'pendente', pendencia: p }, 'chamado_pendente', 'Marcado como pendente.'); });
    on('#cd-devolver', () => mudar({ situacao: 'aberto' }, 'chamado_devolvido', 'Devolvido à fila, na posição original.'));
    on('#cd-cancelar', async () => { if (await UI.confirmar('Cancelar o chamado?', { ok: 'Cancelar chamado', cancelar: 'Voltar', perigo: true })) mudar({ situacao: 'cancelado' }, 'chamado_cancelado', 'Cancelado.'); });
    on('#cd-corrigir', () => { f.fechar(); abrirChamado(c); });
  }

  // Nome que so o celular gera (N.aparelho): "Nome · modelo", "navegador",
  // "celular". O computador manda o nome do Windows (socket.gethostname),
  // que nunca tem " · ".
  const nomeDeCelular = (m, ap) => m === ap.maquina || m.includes(' · ') || /^(celular|navegador|iphone \(navegador\))$/i.test(m);

  // O que o bilhete seguinte ja traz preenchido, dos MEUS chamados:
  // - o telefone do mais recente que tiver um (chamados_nucleo.py,
  //   _lembrar_telefone): quase sempre e o mesmo;
  // - o computador do mais recente aberto DE UM COMPUTADOR. No celular o
  //   "computador com problema" quase nunca e o celular; o nome que o
  //   SistemaCMH mandou sozinho da ultima vez e o melhor palpite, e no
  //   mesmo formato que o T.I. ja le na fila.
  async function lembrancas(ap) {
    try {
      const { data, error } = await N.sb.from('orc_chamados').select('id,telefone,maquina').eq('de', eu().id).order('id', { ascending: false }).limit(30);
      if (error) throw error;
      const lista = data || [];
      return {
        fone: lista.map((c) => L.telefone(c.telefone)).find(Boolean) || '',
        maquina: lista.map((c) => String(c.maquina || '').trim()).find((m) => m && !nomeDeCelular(m, ap)) || '',
      };
    } catch { return { fone: '', maquina: '' }; }
  }

  async function abrirChamado(c) {
    const ap = await N.aparelho();
    const lembra = c ? { fone: '', maquina: '' } : await lembrancas(ap);
    const fone = L.telefone(c?.telefone) || c?.telefone || lembra.fone;
    const f = UI.folha(`<form id="af">
      <div class="fg"><label>O que aconteceu</label><select id="af-tipo">${UI.opcoes(L.TIPOS_CHAMADO, c?.tipo || L.TIPOS_CHAMADO[0])}</select></div>
      <div class="fg"><label>Conte com detalhes</label><textarea id="af-desc" maxlength="2000" required>${esc(c?.descricao || '')}</textarea><div class="dica">Diga o que você estava fazendo e o que apareceu na tela.</div></div>
      <div class="fg"><label>Seu telefone (para o T.I. ligar)</label><input id="af-fone" inputmode="tel" required value="${esc(fone)}">${!c && lembra.fone ? '<div class="dica">Veio o do seu último chamado.</div>' : ''}</div>
      ${c ? '' : `<div class="fg"><label>Computador com problema</label><input id="af-maq" maxlength="60" autocapitalize="characters" autocorrect="off" spellcheck="false" placeholder="nome do computador, ex.: RECEPCAO-01" value="${esc(lembra.maquina)}">
        <div class="dica">O nome que o Windows dá ao computador, o mesmo que o SistemaCMH manda sozinho quando o chamado é aberto de lá.${lembra.maquina ? ' Veio o do seu último chamado aberto de um computador.' : ''} Vazio = este celular (${esc(ap.maquina)}).</div></div>`}
      <div class="modal-ft"><button class="btn btn-ok" type="submit">${c ? 'Salvar' : 'Abrir chamado'}</button></div></form>`, { titulo: c ? 'Corrigir chamado' : 'Abrir chamado' });
    $('#af', f.caixa).onsubmit = async (e) => {
      e.preventDefault();
      const fone = L.telefone($('#af-fone', f.caixa).value);
      if (!fone) return toast('Telefone inválido: precisa de pelo menos 8 dígitos.', 'err');
      const desc = $('#af-desc', f.caixa).value.trim().slice(0, 2000);
      if (!desc) return toast('Conte o que aconteceu.', 'err');
      const corpo = { tipo: $('#af-tipo', f.caixa).value, descricao: desc, telefone: fone };
      try {
        if (c) { await N.mudar('orc_chamados', { id: c.id }, corpo); N.registrar('chamado_corrigido', `#${c.id}`); }
        else {
          const maq = ($('#af-maq', f.caixa).value.trim() || ap.maquina).slice(0, 60);
          const { data, error } = await N.sb.from('orc_chamados').insert({ ...corpo, de: eu().id, de_nome: eu().nome, de_setor: eu().setor || null, maquina: maq }).select();
          if (error) throw error; if (!data?.length) throw new Error('O servidor não abriu o chamado.');
          N.registrar('chamado_aberto', `#${data[0].id} ${corpo.tipo}`);
        }
        toast(c ? 'Salvo.' : 'Chamado aberto. O T.I. foi avisado.', 'ok'); f.fechar(); if (tela._recarregar) tela._recarregar();
      } catch (err) { toast(N.recado(err), 'err'); }
    };
  }

  async function contar() {
    if (!L.veAFila(eu())) return null;
    const { data, error } = await N.sb.from('orc_chamados').select('id,de').eq('situacao', 'aberto').limit(1000);
    if (error) throw error;
    return (data || []).filter((c) => c.de !== eu().id).length;
  }

  MODULOS.chamados = {
    chave: 'chamados', nome: 'Chamados T.I.', sub: 'Pedir ajuda ao T.I.', icone: ICONES.chamados,
    // SO QUEM TEM O VISTO, como o computador (app.py, modulos_do_usuario):
    // ser do T.I. nao abre o modulo sozinho. O administrador ve tudo
    // (L.temModulo ja trata).
    precisa: (u) => L.temModulo(u, 'chamados'),
    abrir: () => UI.ir(tela),
    contar,
  };
})();
