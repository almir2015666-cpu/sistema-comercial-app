/* =====================================================================
   Chat — salas por setor e conversas de duas pessoas, as mesmas do
   programa do computador (orc_chat e companhia).

   O que o servidor manda: a RLS decide quem le cada sala; nao ha UPDATE em
   mensagem (apagar para todos e uma RPC); o anexo sobe primeiro e a
   mensagem depois; a marca de leitura e por conversa ('p:<uuid>'/'s:<setor>').
   ===================================================================== */
(() => {
  'use strict';
  const { $, $$, esc, toast, ICONES } = UI;
  const COLUNAS = 'id,de,para,setor,texto,criado_em,arquivo,arquivo_nome,arquivo_tamanho,responde_a,apagada_em,encaminhada';
  const DIAS_DA_CAIXA = 180;
  const eu = () => N.estado.eu;
  const cacheUrl = new Map();

  const filtroDe = (chave) => L.eSetor(chave)
    ? (q) => q.eq('setor', L.alvoDaChave(chave))
    : (q) => q.or(`and(de.eq.${eu().id},para.eq.${L.alvoDaChave(chave)}),and(de.eq.${L.alvoDaChave(chave)},para.eq.${eu().id})`);

  async function pessoas() {
    const { data, error } = await N.sb.from('orc_chat_pessoas').select('id,nome,cargo,setor,ultimo_acesso').order('nome');
    if (error) throw error;
    return data || [];
  }
  async function marcas() {
    const { data, error } = await N.sb.from('orc_chat_lido').select('conversa,ate_id').eq('usuario', eu().id).limit(1000);
    if (error) throw error;
    return Object.fromEntries((data || []).map((m) => [m.conversa, m.ate_id]));
  }
  async function fixadas() {
    const { data } = await N.sb.from('orc_chat_fixada').select('conversa').eq('usuario', eu().id).limit(200);
    return new Set((data || []).map((f) => f.conversa));
  }
  async function caixa() {
    const desde = new Date(Date.now() - DIAS_DA_CAIXA * 86400000).toISOString();
    const { data, error } = await N.sb.from('orc_chat').select('id,de,para,setor')
      .or(`para.eq.${eu().id},de.eq.${eu().id},setor.not.is.null`).gte('criado_em', desde).order('id', { ascending: false }).limit(1000);
    if (error) throw error;
    return data || [];
  }
  async function marcarLido(chave, ateId) {
    if (!ateId) return;
    await N.sb.from('orc_chat_lido').upsert({ usuario: eu().id, conversa: chave, ate_id: ateId }, { onConflict: 'usuario,conversa' });
  }
  async function urlDe(caminho) {
    if (cacheUrl.has(caminho)) return cacheUrl.get(caminho);
    const u = await N.urlAssinada(CFG.baldeChat, caminho, 1800);
    cacheUrl.set(caminho, u);
    return u;
  }

  /* --------------------------------------------------------- lista */
  const telaLista = {
    titulo: 'Chat',
    async desenhar(el) {
      el.innerHTML = `<div class="text-muted centro pequeno">Carregando…</div>`;
      let vivo = true;
      const desenharLista = async () => {
        if (!vivo || document.hidden) return;
        try {
          const [gente, mk, fx, cx] = await Promise.all([pessoas(), marcas(), fixadas(), caixa()]);
          if (!vivo) return;
          const naoLidas = L.contarNaoLidas(cx, eu().id, mk);
          const aResponder = new Set(L.salasAResponder(cx, eu().id, mk));
          const salas = L.salasDeSetor(gente, eu());
          const itens = [
            ...salas.map((s) => ({ chave: L.chaveSetor(s), nome: s, sub: 'Sala do setor', setor: true, online: false })),
            ...gente.map((p) => ({ chave: L.chavePessoa(p.id), nome: p.nome, sub: [p.cargo, p.setor].filter(Boolean).join(' · '), online: L.estaAgora(p.ultimo_acesso) })),
          ].map((i) => ({ ...i, fixa: fx.has(i.chave), n: naoLidas[i.chave] || 0, pendencia: naoLidas[i.chave] ? 0 : aResponder.has(i.chave) ? 1 : 2 }));
          const ordenados = L.ordenarConversas(itens);
          const secoes = [['Fixadas', ordenados.filter((i) => i.fixa)], ['Setores', ordenados.filter((i) => !i.fixa && i.setor)], ['Pessoas', ordenados.filter((i) => !i.fixa && !i.setor)]];
          const total = Object.values(naoLidas).reduce((a, b) => a + b, 0);
          APP.contagens.chat = total; UI.badgeAba('chat', total);
          el.innerHTML = (eu().admin ? `<div class="aviso info pequeno">Como administrador, você lê todas as salas e conversas — e as pessoas sabem disso.</div>` : '') +
            secoes.filter(([, l]) => l.length).map(([t, l]) => `<div class="secao">${t}</div><div class="lista">${l.map((i) => `
              <button class="linha" type="button" data-chave="${esc(i.chave)}" data-nome="${esc(i.nome)}">
                ${i.setor ? `<span class="avatar av-40" style="background:linear-gradient(135deg,var(--teal),#2dd4bf)">#</span>` : UI.avatar(i.nome, 40, i.online)}
                <div class="linha__corpo"><div class="linha__titulo"><span class="t">${esc(i.nome)}</span>${i.fixa ? '<span class="text-muted">📌</span>' : ''}</div><div class="linha__sub">${esc(i.sub)}${i.pendencia === 1 ? ' · esperando resposta' : ''}</div></div>
                ${i.n ? `<span class="chat-badge">${i.n}</span>` : ''}${ICONES.seta}
              </button>`).join('')}</div>`).join('') || UI.vazio('Ninguém por aqui ainda', 'As pessoas aparecem quando o administrador libera o Chat para elas.');
          $$('.linha', el).forEach((b) => {
            b.onclick = () => UI.ir(telaConversa(b.dataset.chave, b.dataset.nome));
            let t;
            b.addEventListener('touchstart', () => { t = setTimeout(() => menuConversa(b.dataset.chave, fx.has(b.dataset.chave), desenharLista), 550); }, { passive: true });
            b.addEventListener('touchend', () => clearTimeout(t)); b.addEventListener('touchmove', () => clearTimeout(t));
            b.oncontextmenu = (e) => { e.preventDefault(); menuConversa(b.dataset.chave, fx.has(b.dataset.chave), desenharLista); };
          });
        } catch (e) { if (vivo) el.innerHTML = `<div class="aviso erro">${esc(N.recado(e))}</div>`; }
      };
      await desenharLista();
      const relogio = setInterval(desenharLista, 8000);
      return () => { vivo = false; clearInterval(relogio); };
    },
  };

  function menuConversa(chave, fixa, depois) {
    const f = UI.folha(`<div class="lista" style="border:none"><button class="linha" type="button" id="mc-fixar"><div class="linha__corpo"><div class="linha__titulo"><span class="t">${fixa ? 'Desafixar' : 'Fixar no topo'}</span></div></div></button></div>`, { titulo: 'Conversa' });
    $('#mc-fixar', f.caixa).onclick = async () => {
      try {
        if (fixa) await N.sb.from('orc_chat_fixada').delete().eq('usuario', eu().id).eq('conversa', chave);
        else await N.sb.from('orc_chat_fixada').upsert({ usuario: eu().id, conversa: chave }, { onConflict: 'usuario,conversa' });
        f.fechar(); depois();
      } catch (e) { toast(N.recado(e), 'err'); }
    };
  }

  /* ------------------------------------------------------ conversa */
  function telaConversa(chave, nome) {
    const ehSala = L.eSetor(chave);
    let mensagens = [], ultimoId = 0, respondendo = null, vivo = true, nomes = {}, reacoes = {}, vistoAte = 0;

    async function carregar(depoisDe) {
      let q = N.sb.from('orc_chat').select(COLUNAS);
      q = filtroDe(chave)(q);
      if (depoisDe) q = q.gt('id', depoisDe).order('id', { ascending: true }).limit(500);
      else q = q.order('id', { ascending: false }).limit(200);
      const { data, error } = await q;
      if (error) throw error;
      return depoisDe ? (data || []) : (data || []).reverse();
    }
    async function carregarReacoes(ids) {
      if (!ids.length) return;
      const ult = ids.slice().sort((a, b) => b - a).slice(0, 120);
      const { data } = await N.sb.from('orc_chat_reacao').select('mensagem,usuario,emoji').in('mensagem', ult).limit(1000);
      for (const id of ult) reacoes[id] = [];
      for (const r of data || []) (reacoes[r.mensagem] = reacoes[r.mensagem] || []).push(r);
    }
    async function carregarVisto() {
      if (!ehSala) return;
      const { data } = await N.sb.from('orc_chat_lido').select('usuario,ate_id').eq('conversa', chave).limit(500);
      const minhaUltima = [...mensagens].reverse().find((m) => m.de === eu().id);
      vistoAte = minhaUltima ? (data || []).filter((v) => v.usuario !== eu().id && v.ate_id >= minhaUltima.id).length : 0;
    }

    function bolha(m) {
      const minha = m.de === eu().id;
      const apagada = !!m.apagada_em;
      const cit = m.responde_a ? mensagens.find((x) => x.id === m.responde_a) : null;
      const nomeDe = nomes[m.de] || (minha ? 'Você' : '…');
      let corpo = '';
      if (apagada) corpo = `<span>${esc(L.APAGADA)}</span>`;
      else {
        if (m.arquivo) {
          corpo += L.eImagem(m.arquivo_nome)
            ? `<img class="chat-bubble-img" data-arq="${esc(m.arquivo)}" alt="${esc(m.arquivo_nome)}" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==">`
            : `<a class="chat-bubble-file" href="#" data-arq="${esc(m.arquivo)}">📎 ${esc(m.arquivo_nome)} <small>${esc(L.tamanhoLegivel(m.arquivo_tamanho))}</small></a>`;
          if (m.texto && m.texto !== m.arquivo_nome) corpo += esc(m.texto);
        } else corpo += esc(m.texto);
      }
      const rs = reacoes[m.id] || [];
      const agrup = {};
      for (const r of rs) agrup[r.emoji] = (agrup[r.emoji] || 0) + 1;
      return `<div class="chat-bubble ${minha ? 'me' : ''} ${apagada ? 'apagada' : ''}" data-id="${m.id}">
        ${ehSala && !minha ? `<div class="chat-bubble-from">${esc(nomeDe)}</div>` : ''}
        ${m.encaminhada ? '<div class="chat-bubble-from">↪ encaminhada</div>' : ''}
        ${cit ? `<div class="chat-cita">${esc(nomes[cit.de] || '')}: ${esc(cit.apagada_em ? L.APAGADA : (cit.texto || cit.arquivo_nome || ''))}</div>` : ''}
        ${corpo}
        ${rs.length ? `<div class="chat-reacoes">${Object.entries(agrup).map(([e, n]) => `<span>${esc(e)}${n > 1 ? ' ' + n : ''}</span>`).join('')}</div>` : ''}
        <span class="chat-bubble-time">${esc(L.horaBr(m.criado_em))}</span>
      </div>`;
    }

    function desenharMensagens(caixa, rolar) {
      const noFim = caixa.scrollHeight - caixa.scrollTop - caixa.clientHeight < 80;
      let html = '', diaAnterior = '';
      for (const m of mensagens) {
        const dia = String(m.criado_em).slice(0, 10);
        if (dia !== diaAnterior) { html += `<div class="chat-dia">${esc(UI.diaPorExtenso(dia))}</div>`; diaAnterior = dia; }
        html += bolha(m);
      }
      if (ehSala && vistoAte) html += `<div class="chat-visto">Visto por ${vistoAte}</div>`;
      caixa.innerHTML = html || `<div class="vazio"><strong>Nenhuma mensagem ainda</strong>Escreva a primeira.</div>`;
      if (rolar || noFim) caixa.scrollTop = caixa.scrollHeight;
      $$('[data-arq]', caixa).forEach((a) => {
        if (a.tagName === 'IMG') urlDe(a.dataset.arq).then((u) => { a.src = u; }).catch(() => {});
        a.onclick = async (e) => { e.preventDefault(); try { await UI.abrirFora(await urlDe(a.dataset.arq)); } catch (err) { toast(err.message, 'err'); } };
      });
      $$('.chat-bubble', caixa).forEach((b) => {
        let t;
        b.addEventListener('touchstart', () => { t = setTimeout(() => menuMensagem(Number(b.dataset.id)), 500); }, { passive: true });
        b.addEventListener('touchend', () => clearTimeout(t)); b.addEventListener('touchmove', () => clearTimeout(t));
        b.oncontextmenu = (e) => { e.preventDefault(); menuMensagem(Number(b.dataset.id)); };
      });
    }

    function menuMensagem(id) {
      const m = mensagens.find((x) => x.id === id); if (!m) return;
      const minha = m.de === eu().id;
      const f = UI.folha(`
        ${m.apagada_em ? '' : `<div class="chat-emojis">${L.EMOJIS.map((e) => `<button type="button" data-e="${esc(e)}">${esc(e)}</button>`).join('')}</div>`}
        <div class="lista" style="border:none">
          ${m.apagada_em ? '' : `<button class="linha" type="button" id="mm-resp"><div class="linha__corpo"><div class="linha__titulo"><span class="t">Responder</span></div></div></button>`}
          ${m.apagada_em ? '' : `<button class="linha" type="button" id="mm-enc"><div class="linha__corpo"><div class="linha__titulo"><span class="t">Encaminhar</span></div></div></button>`}
          ${minha && !m.apagada_em ? `<button class="linha" type="button" id="mm-apagar"><div class="linha__corpo"><div class="linha__titulo"><span class="t" style="color:var(--red)">Apagar para todos</span></div></div></button>` : ''}
          ${eu().admin ? `<button class="linha" type="button" id="mm-del"><div class="linha__corpo"><div class="linha__titulo"><span class="t" style="color:var(--red)">Apagar do banco (administrador)</span></div></div></button>` : ''}
        </div>`, { titulo: 'Mensagem' });
      $$('.chat-emojis button', f.caixa).forEach((b) => { b.onclick = async () => {
        const minhaReacao = (reacoes[id] || []).find((r) => r.usuario === eu().id);
        try {
          if (minhaReacao && minhaReacao.emoji === b.dataset.e) await N.sb.from('orc_chat_reacao').delete().eq('mensagem', id).eq('usuario', eu().id);
          else await N.sb.from('orc_chat_reacao').upsert({ mensagem: id, usuario: eu().id, emoji: b.dataset.e }, { onConflict: 'mensagem,usuario' });
          f.fechar(); await carregarReacoes([id]); desenharMensagens($('#chat-msgs'), false);
        } catch (e) { toast(N.recado(e), 'err'); }
      }; });
      const bResp = $('#mm-resp', f.caixa); if (bResp) bResp.onclick = () => { respondendo = m; pintarRespondendo(); f.fechar(); $('#chat-txt')?.focus(); };
      const bEnc = $('#mm-enc', f.caixa); if (bEnc) bEnc.onclick = () => { f.fechar(); encaminhar(m); };
      const bAp = $('#mm-apagar', f.caixa); if (bAp) bAp.onclick = async () => {
        if (!await UI.confirmar('Apagar esta mensagem para todos?', { ok: 'Apagar', perigo: true })) return;
        const { error } = await N.sb.rpc('orc_chat_apagar_para_todos', { p_id: id });
        if (error) return toast(error.code === '42501' ? 'Só quem escreveu pode apagar a própria mensagem.' : N.recado(error), 'err');
        f.fechar(); await recarregarTudo();
      };
      const bDel = $('#mm-del', f.caixa); if (bDel) bDel.onclick = async () => {
        if (!await UI.confirmar('Apagar do banco, sem volta?', { ok: 'Apagar', perigo: true })) return;
        try { await N.apagar('orc_chat', { id }); f.fechar(); await recarregarTudo(); } catch (e) { toast(N.recado(e), 'err'); }
      };
    }

    async function encaminhar(m) {
      const gente = await pessoas().catch(() => []);
      const salas = L.salasDeSetor(gente, eu());
      const f = UI.folha(`<div class="fg"><label>Para</label><select id="enc-alvo">
        ${salas.map((s) => `<option value="s:${esc(s)}">Sala: ${esc(s)}</option>`).join('')}
        ${gente.map((p) => `<option value="p:${esc(p.id)}">${esc(p.nome)}</option>`).join('')}</select></div>
        <div class="modal-ft"><button class="btn btn-ok" id="enc-ok" type="button">Encaminhar</button></div>`, { titulo: 'Encaminhar' });
      $('#enc-ok', f.caixa).onclick = async () => {
        const alvo = $('#enc-alvo', f.caixa).value;
        const corpo = { de: eu().id, texto: m.texto || m.arquivo_nome || '', arquivo: m.arquivo, arquivo_nome: m.arquivo_nome, arquivo_tamanho: m.arquivo_tamanho, encaminhada: true };
        if (L.eSetor(alvo)) corpo.setor = L.alvoDaChave(alvo); else corpo.para = L.alvoDaChave(alvo);
        const { error } = await N.sb.from('orc_chat').insert(corpo);
        if (error) return toast(N.recado(error), 'err');
        toast('Encaminhada.', 'ok'); f.fechar();
      };
    }

    function pintarRespondendo() {
      const r = $('#chat-resp');
      if (!respondendo) { r.hidden = true; return; }
      r.hidden = false;
      r.innerHTML = `<span class="flex1">↩ ${esc(nomes[respondendo.de] || '')}: ${esc((respondendo.texto || respondendo.arquivo_nome || '').slice(0, 80))}</span><button class="btn-icon" type="button" id="chat-resp-x">✕</button>`;
      $('#chat-resp-x').onclick = () => { respondendo = null; pintarRespondendo(); };
    }

    async function enviar(texto, arquivo) {
      const corpo = { de: eu().id };
      if (ehSala) corpo.setor = L.alvoDaChave(chave); else corpo.para = L.alvoDaChave(chave);
      if (respondendo) corpo.responde_a = respondendo.id;
      if (arquivo) {
        if (arquivo.size <= 0 || arquivo.size > L.LIMITE_ARQUIVO) return toast(`O arquivo tem ${L.tamanhoLegivel(arquivo.size)}; o limite é 25 MB.`, 'err');
        const caminho = L.caminhoAnexo(eu().id, arquivo.name, N.hex12());
        UI.carregando(true, 'Enviando o arquivo…');
        try { await N.subir(CFG.baldeChat, caminho, arquivo); } catch (e) { UI.carregando(false); return toast(e.message, 'err'); }
        UI.carregando(false);
        corpo.arquivo = caminho; corpo.arquivo_nome = arquivo.name; corpo.arquivo_tamanho = arquivo.size;
        corpo.texto = L.limparTexto(texto) || arquivo.name;
      } else {
        corpo.texto = L.limparTexto(texto);
        if (!corpo.texto) return;
      }
      const { error } = await N.sb.from('orc_chat').insert(corpo);
      if (error) return toast(error.code === '42501' && ehSala ? 'Você não é desse setor.' : N.recado(error), 'err');
      respondendo = null; pintarRespondendo();
      await puxarNovas(true);
    }

    async function puxarNovas(rolar) {
      const novas = await carregar(ultimoId);
      if (!novas.length) return;
      mensagens.push(...novas);
      ultimoId = mensagens[mensagens.length - 1].id;
      await carregarReacoes(novas.map((m) => m.id));
      desenharMensagens($('#chat-msgs'), rolar);
      marcarLido(chave, ultimoId).catch(() => {});
    }
    async function recarregarTudo() {
      mensagens = await carregar(0);
      ultimoId = mensagens.length ? mensagens[mensagens.length - 1].id : 0;
      reacoes = {};
      await Promise.all([carregarReacoes(mensagens.map((m) => m.id)), carregarVisto()]);
      desenharMensagens($('#chat-msgs'), true);
      marcarLido(chave, ultimoId).catch(() => {});
    }

    return {
      titulo: nome, classe: 'chat',
      async desenhar(el) {
        el.innerHTML = `<div class="chat-thread">
          <div class="chat-messages" id="chat-msgs"><div class="text-muted centro pequeno">Carregando…</div></div>
          <div class="chat-respondendo" id="chat-resp" hidden></div>
          <div class="chat-composer">
            <button class="chat-attach-btn" type="button" id="chat-anexo" aria-label="Anexar">${ICONES.anexo}</button>
            <textarea id="chat-txt" rows="1" placeholder="Mensagem" maxlength="2000"></textarea>
            <button class="chat-send-btn" type="button" id="chat-enviar" aria-label="Enviar">${ICONES.enviar}</button>
          </div></div>`;
        const txt = $('#chat-txt', el);
        txt.oninput = () => { txt.style.height = 'auto'; txt.style.height = Math.min(120, txt.scrollHeight) + 'px'; };
        $('#chat-enviar', el).onclick = async () => { const t = txt.value; txt.value = ''; txt.style.height = 'auto'; await enviar(t, null); };
        $('#chat-anexo', el).onclick = async () => { const f = await UI.escolherArquivo('*/*'); if (f) await enviar(txt.value, f); txt.value = ''; };
        try {
          const gente = await pessoas();
          for (const p of gente) nomes[p.id] = p.nome;
          nomes[eu().id] = eu().nome;
          await recarregarTudo();
        } catch (e) { $('#chat-msgs', el).innerHTML = `<div class="aviso erro">${esc(N.recado(e))}</div>`; }
        let batidas = 0;
        const relogio = setInterval(async () => {
          if (!vivo || document.hidden) return;
          try { await puxarNovas(false); if (ehSala && ++batidas % 5 === 0) { await carregarVisto(); } } catch { /* rede */ }
        }, 3000);
        return () => { vivo = false; clearInterval(relogio); };
      },
    };
  }

  /* ---------------------------------------------------------- modulo */
  async function contar() {
    const [mk, cx] = await Promise.all([marcas(), caixa()]);
    return Object.values(L.contarNaoLidas(cx, eu().id, mk)).reduce((a, b) => a + b, 0);
  }

  MODULOS.chat = {
    chave: 'chat', nome: 'Chat', sub: 'Salas e conversas da equipe', icone: ICONES.chat,
    precisa: (u) => L.temModulo(u, 'chat'),
    abrir: (comoAba) => comoAba ? UI.raiz(telaLista, 'chat') : UI.ir(telaLista),
    contar,
  };
})();
