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

  // Quantas pessoas cada sala tem, como o chat_nucleo.setores(): conta o
  // setor de cada pessoa (a coluna aceita varios, por virgula) e eu tambem,
  // porque a view orc_chat_pessoas me deixa de fora. Chave em minusculas
  // porque o app junta "SESMT" e "Sesmt" numa sala so (L.salasDeSetor).
  function gentePorSala(gente) {
    const n = {};
    for (const p of [...gente, eu()]) for (const s of new Set(L.meusSetores(p))) n[s] = (n[s] || 0) + 1;
    return n;
  }

  // Copiar para a area de transferencia. O clipboard do navegador pode
  // recusar (permissao do WebView); o jeito antigo com textarea cobre.
  async function copiar(texto) {
    try { await navigator.clipboard.writeText(texto); return true; } catch { /* tenta o antigo */ }
    try {
      const t = document.createElement('textarea');
      t.value = texto; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select();
      const ok = document.execCommand('copy');
      t.remove();
      return ok;
    } catch { return false; }
  }

  // A foto aberta dentro do app, como o "Ver imagem" do computador. O botao
  // de abrir fora fica para quem quer salvar ou mandar para outro lugar.
  async function verImagem(m) {
    const f = UI.folha(`<div class="centro"><img id="vi-img" alt="${esc(m.arquivo_nome || '')}" style="max-width:100%;max-height:70vh;border-radius:12px" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="></div>
      <div class="text-muted pequeno centro mt8">${esc(m.arquivo_nome || '')} · ${esc(L.tamanhoLegivel(m.arquivo_tamanho))}</div>
      <div class="modal-ft"><button class="btn btn-ghost" type="button" id="vi-fora">Abrir fora do app</button></div>`, { titulo: 'Imagem' });
    try { $('#vi-img', f.caixa).src = await urlDe(m.arquivo); } catch (e) { toast(N.recado(e), 'err'); }
    $('#vi-fora', f.caixa).onclick = async () => { try { await UI.abrirFora(await urlDe(m.arquivo)); } catch (e) { toast(N.recado(e), 'err'); } };
  }

  // PROCURAR NO HISTORICO, como a JanelaBusca do computador: procura em tudo
  // o que eu posso ver. Quem corta o que nao e meu e a RLS do orc_chat, nao
  // este filtro. Tocar num achado abre a conversa dele.
  async function procurarNoHistorico() {
    const gente = await pessoas().catch(() => []);
    const nomes = Object.fromEntries(gente.map((p) => [p.id, p.nome]));
    nomes[eu().id] = eu().nome;
    const f = UI.folha(`<form id="ph-form"><div class="busca">${ICONES.busca}<input id="ph-termo" placeholder="Palavra ou frase" autocomplete="off" enterkeyhint="search"></div></form>
      <div class="text-muted pequeno mt8" id="ph-conta"></div><div id="ph-lista" class="mt8"></div>`, { titulo: 'Procurar no histórico' });
    const campo = $('#ph-termo', f.caixa);
    setTimeout(() => campo.focus(), 50);
    $('#ph-form', f.caixa).onsubmit = async (e) => {
      e.preventDefault();
      const termo = String(campo.value || '').trim();
      const conta = $('#ph-conta', f.caixa), lista = $('#ph-lista', f.caixa);
      lista.innerHTML = '';
      if (termo.length < 2) { conta.textContent = 'Escreva ao menos duas letras para procurar.'; return; }
      conta.textContent = 'Procurando…';
      const { data, error } = await N.sb.from('orc_chat').select(COLUNAS).ilike('texto', `%${termo}%`).order('id', { ascending: false }).limit(100);
      if (error) { conta.textContent = 'Não consegui procurar agora.'; return; }
      const achados = data || [];
      conta.textContent = `${achados.length} mensage${achados.length === 1 ? 'm encontrada' : 'ns encontradas'}`;
      lista.innerHTML = achados.length ? `<div class="lista">${achados.map((m) => {
        const onde = m.setor ? `sala ${m.setor}` : 'conversa privada';
        const quando = `${L.dataBr(String(m.criado_em).slice(0, 10))} ${L.horaBr(m.criado_em)}`;
        return `<button class="linha" type="button" data-id="${m.id}"><div class="linha__corpo"><div class="linha__sub">${esc(nomes[m.de] || 'alguém')} · ${esc(onde)} · ${esc(quando)}</div><div class="linha__titulo"><span class="t" style="white-space:normal">${esc(m.apagada_em ? L.APAGADA : m.texto)}</span></div></div>${ICONES.seta}</button>`;
      }).join('')}</div>` : '';
      $$('[data-id]', lista).forEach((b) => { b.onclick = () => {
        const m = achados.find((x) => x.id === Number(b.dataset.id)); if (!m) return;
        const chave = L.chaveDaLinha(m, eu().id);
        const nome = m.setor || nomes[L.alvoDaChave(chave)] || 'Conversa';
        f.fechar(); UI.ir(telaConversa(chave, nome));
      }; });
    };
  }
  const botaoProcurar = (dir) => { dir.innerHTML = ''; dir.appendChild(UI.botaoTopo(ICONES.busca, () => procurarNoHistorico(), 'Procurar no histórico')); };

  /* --------------------------------------------------------- lista */
  const telaLista = {
    titulo: 'Chat',
    aoTopo: botaoProcurar,
    async desenhar(el) {
      // O campo de procura e a caixa "so as que esperam resposta" ficam FORA
      // do pedaco redesenhado a cada 8 s; senao o relogio apagaria o que a
      // pessoa esta digitando.
      el.innerHTML = `<div class="busca">${ICONES.busca}<input id="cl-busca" placeholder="Setor ou pessoa" autocomplete="off"></div>
        <div class="chips mt8" id="cl-resp" hidden></div>
        <div id="cl-corpo"><div class="text-muted centro pequeno">Carregando…</div></div>`;
      const corpo = $('#cl-corpo', el), caixaResp = $('#cl-resp', el), busca = $('#cl-busca', el);
      let vivo = true, dados = null, soResponder = false;

      const pintar = () => {
        if (!vivo || !dados) return;
        const { gente, mk, fx, cx } = dados;
        const naoLidas = L.contarNaoLidas(cx, eu().id, mk);
        const aResponder = new Set(L.salasAResponder(cx, eu().id, mk));
        const total = Object.values(naoLidas).reduce((a, b) => a + b, 0);
        APP.contagens.chat = total; UI.badgeAba('chat', total);

        // A caixa so existe enquanto houver o que responder (chat_tela
        // _mostrar_caixa_de_responder); sem nenhuma, desliga sozinha.
        if (!aResponder.size) soResponder = false;
        caixaResp.hidden = !aResponder.size;
        caixaResp.innerHTML = aResponder.size ? `<button type="button" class="chip vermelho ${soResponder ? 'on' : ''}" id="cl-so">${aResponder.size > 1 ? `só as ${aResponder.size} que esperam resposta` : 'só a que espera resposta'}</button>` : '';
        const bSo = $('#cl-so', caixaResp); if (bSo) bSo.onclick = () => { soResponder = !soResponder; pintar(); };

        // Um campo so para setor E pessoa; na pessoa vale o nome ou o setor.
        const procura = String(busca.value || '').trim().toLowerCase();
        const serve = (t) => !procura || String(t || '').toLowerCase().includes(procura);
        const porSala = gentePorSala(gente);
        const itens = [
          ...L.salasDeSetor(gente, eu()).filter((s) => serve(s)).map((s) => {
            const q = porSala[s.toLowerCase()] || 0;
            // "ninguem ainda" diz melhor que "0 pessoas": a sala existe vazia
            return { chave: L.chaveSetor(s), nome: s, sub: q ? `${q} pessoa${q !== 1 ? 's' : ''}` : 'ninguém ainda', setor: true, online: false };
          }),
          ...gente.filter((p) => serve(p.nome) || serve(p.setor)).map((p) => ({ chave: L.chavePessoa(p.id), nome: p.nome, sub: [p.cargo, p.setor].filter(Boolean).join(' · '), online: L.estaAgora(p.ultimo_acesso) })),
        ].filter((i) => !soResponder || aResponder.has(i.chave))
          .map((i) => ({ ...i, fixa: fx.has(i.chave), n: naoLidas[i.chave] || 0, pendencia: naoLidas[i.chave] ? 0 : aResponder.has(i.chave) ? 1 : 2 }));
        const ordenados = L.ordenarConversas(itens);
        const fixas = ordenados.filter((i) => i.fixa), setores = ordenados.filter((i) => !i.fixa && i.setor), gentes = ordenados.filter((i) => !i.fixa && !i.setor);
        // "3 de 9 agora" e informacao de trabalho; "9" e so cadastro.
        const ligadas = gentes.filter((i) => i.online).length;
        const secoes = [[`Fixadas · ${fixas.length}`, fixas], [`Setores · ${setores.length}`, setores], [`Pessoas · ${ligadas ? `${ligadas} de ${gentes.length} agora` : gentes.length}`, gentes]];
        const filtrando = !!procura || soResponder;
        corpo.innerHTML = (eu().admin ? `<div class="aviso info pequeno">Como administrador, você lê todas as salas e conversas, e as pessoas sabem disso.</div>` : '') +
          (secoes.filter(([, l]) => l.length).map(([t, l]) => `<div class="secao">${esc(t)}</div><div class="lista">${l.map((i) => `
            <button class="linha" type="button" data-chave="${esc(i.chave)}" data-nome="${esc(i.nome)}">
              ${i.setor ? `<span class="avatar av-40" style="background:linear-gradient(135deg,var(--teal),#2dd4bf)">#</span>` : UI.avatar(i.nome, 40, i.online)}
              <div class="linha__corpo"><div class="linha__titulo"><span class="t">${esc(i.nome)}</span>${i.fixa ? '<span class="text-muted">📌</span>' : ''}</div><div class="linha__sub">${esc(i.sub)}${i.pendencia === 1 ? ' · esperando resposta' : ''}</div></div>
              ${i.n ? `<span class="chat-badge">${i.n}</span>` : ''}${ICONES.seta}
            </button>`).join('')}</div>`).join('') ||
          (filtrando ? UI.vazio('Ninguém com esse nome') : UI.vazio('Ninguém por aqui ainda', 'As pessoas aparecem quando o administrador libera o Chat para elas.')));
        $$('.linha', corpo).forEach((b) => {
          b.onclick = () => UI.ir(telaConversa(b.dataset.chave, b.dataset.nome));
          let t;
          b.addEventListener('touchstart', () => { t = setTimeout(() => menuConversa(b.dataset.chave, fx.has(b.dataset.chave), desenharLista), 550); }, { passive: true });
          b.addEventListener('touchend', () => clearTimeout(t)); b.addEventListener('touchmove', () => clearTimeout(t));
          b.oncontextmenu = (e) => { e.preventDefault(); menuConversa(b.dataset.chave, fx.has(b.dataset.chave), desenharLista); };
        });
      };

      const desenharLista = async () => {
        if (!vivo || document.hidden) return;
        try {
          const [gente, mk, fx, cx] = await Promise.all([pessoas(), marcas(), fixadas(), caixa()]);
          if (!vivo) return;
          dados = { gente, mk, fx, cx };
          pintar();
        } catch (e) { if (vivo) corpo.innerHTML = `<div class="aviso erro">${esc(N.recado(e))}</div>`; }
      };
      // filtrar nao vai ao servidor: repinta com o que ja veio
      busca.oninput = () => pintar();
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
    // gente: a lista de pessoas (para o "Quem já viu"); quemLeu: {usuario: ate_id}
    let gente = [], quemLeu = {};

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
      quemLeu = Object.fromEntries((data || []).filter((v) => v.usuario).map((v) => [v.usuario, Number(v.ate_id) || 0]));
      const minhaUltima = [...mensagens].reverse().find((m) => m.de === eu().id);
      vistoAte = minhaUltima ? (data || []).filter((v) => v.usuario !== eu().id && v.ate_id >= minhaUltima.id).length : 0;
    }

    // QUEM JA VIU, como chat_tela._quem_ja_viu: so em sala de setor e so das
    // minhas mensagens (na conversa de duas pessoas a marca continua
    // privada). Quem leu ate um id maior ou igual ao desta mensagem, viu.
    async function quemJaViu(m) {
      try { await carregarVisto(); } catch { /* usa o que ja tinha */ }
      const viram = [], faltam = [];
      for (const p of gente) {
        if (p.id === eu().id) continue;
        ((quemLeu[p.id] || 0) >= m.id ? viram : faltam).push(p.nome || 'alguém');
      }
      const ordem = (a, b) => a.localeCompare(b, 'pt-BR');
      viram.sort(ordem); faltam.sort(ordem);
      UI.folha(`<div class="secao">Já viram (${viram.length})</div><div class="pequeno mt8 mb12">${esc(viram.join(', ') || 'ninguém ainda')}</div>
        ${faltam.length ? `<div class="secao">Ainda não (${faltam.length})</div><div class="pequeno mt8 mb12">${esc(faltam.join(', '))}</div>` : ''}
        <div class="text-muted pequeno">A marca é de quem abriu a sala até aqui. Abrir não garante que leu.</div>`, { titulo: 'Quem já viu' });
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
      if (ehSala && vistoAte) html += `<div class="chat-visto" id="chat-visto" role="button">Visto por ${vistoAte} · ver quem</div>`;
      caixa.innerHTML = html || `<div class="vazio"><strong>Nenhuma mensagem ainda</strong>Escreva a primeira.</div>`;
      if (rolar || noFim) caixa.scrollTop = caixa.scrollHeight;
      const visto = $('#chat-visto', caixa);
      if (visto) visto.onclick = () => { const minha = [...mensagens].reverse().find((m) => m.de === eu().id); if (minha) quemJaViu(minha); };
      $$('[data-arq]', caixa).forEach((a) => {
        if (a.tagName === 'IMG') {
          urlDe(a.dataset.arq).then((u) => { a.src = u; }).catch(() => {});
          // foto abre por cima, dentro do app; o "abrir fora" fica no botao
          a.onclick = (e) => { e.preventDefault(); const m = mensagens.find((x) => x.arquivo === a.dataset.arq); if (m) verImagem(m); };
          return;
        }
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
      // O MESMO MENU DO COMPUTADOR (chat_tela._menu_no_balao). Numa mensagem
      // apagada nao ha texto para copiar nem anexo, entao nada se oferece.
      // O "Apagar do banco" do administrador NAO mora aqui: no computador
      // ele tambem nao aparece no chat.
      const item = (id, rotulo, perigo) => `<button class="linha" type="button" id="${id}"><div class="linha__corpo"><div class="linha__titulo"><span class="t"${perigo ? ' style="color:var(--red)"' : ''}>${rotulo}</span></div></div></button>`;
      const f = UI.folha(m.apagada_em ? `<div class="text-muted pequeno centro">(mensagem apagada)</div>` : `
        <div class="chat-emojis">${L.EMOJIS.map((e) => `<button type="button" data-e="${esc(e)}">${esc(e)}</button>`).join('')}</div>
        <div class="lista" style="border:none">
          ${item('mm-resp', 'Responder')}
          ${item('mm-enc', 'Encaminhar')}
          ${m.texto ? item('mm-copiar', 'Copiar texto') : ''}
          ${m.arquivo && L.eImagem(m.arquivo_nome) ? item('mm-ver', 'Ver imagem') : ''}
          ${m.arquivo ? item('mm-arq', 'Abrir arquivo') : ''}
          ${minha && ehSala ? item('mm-viu', 'Quem já viu') : ''}
          ${minha ? item('mm-apagar', 'Apagar para todos', true) : ''}
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
      const bCop = $('#mm-copiar', f.caixa); if (bCop) bCop.onclick = async () => {
        f.fechar();
        const ok = await copiar(String(m.texto || ''));
        toast(ok ? 'Texto copiado.' : 'Não consegui copiar.', ok ? 'ok' : 'err');
      };
      const bVer = $('#mm-ver', f.caixa); if (bVer) bVer.onclick = () => { f.fechar(); verImagem(m); };
      const bArq = $('#mm-arq', f.caixa); if (bArq) bArq.onclick = async () => {
        f.fechar();
        try { await UI.abrirFora(await urlDe(m.arquivo)); } catch (e) { toast(N.recado(e), 'err'); }
      };
      const bViu = $('#mm-viu', f.caixa); if (bViu) bViu.onclick = () => { f.fechar(); quemJaViu(m); };
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
      aoTopo: botaoProcurar,
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
          gente = await pessoas();
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
