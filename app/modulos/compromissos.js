/* =====================================================================
   Compromissos — reuniao, visita, cobranca, com hora e convidados.
   Quem nao marcou so consegue responder a propria presenca: o gatilho do
   banco devolve todo o resto ao valor antigo. Os e-mails de lembrete
   continuam saindo do programa do computador, nao daqui. O calendario do
   mes e a folha de imprimir tambem ficam so no computador.
   ===================================================================== */
(() => {
  'use strict';
  const { $, $$, esc, toast, ICONES } = UI;
  const CAMPOS_BASE = 'id,titulo,descricao,quando,minutos,tipo,lugar,de,de_nome,participantes,nomes,setor,respostas,avisar_minutos,email_vespera,email_perto,situacao,criado_em';
  // As colunas do 58 (quem confirmou que a reuniao aconteceu, e quando).
  // Ficam separadas porque o servidor pode ainda nao te-las: a leitura
  // tenta com elas e, se o banco recusar, repete sem. Igual ao programa
  // do computador: a agenda nao pode sumir por causa de uma coluna nova.
  const CAMPOS_REALIZADO = 'realizado_em,realizado_por,realizado_por_nome';
  const eu = () => N.estado.eu;

  // NEQ CANCELADO, e nao "so os marcados": o compromisso confirmado como
  // realizado continua sendo agenda. E o registro de que a reuniao
  // aconteceu, e sumia da tela quando a pergunta era "quais estao
  // marcados". O desmarcado sai, como no computador.
  async function listar(deISO, ateISO) {
    const pedir = (campos) => N.sb.from('orc_compromissos').select(campos).gte('quando', `${deISO}T00:00:00`).lte('quando', `${ateISO}T23:59:59`)
      .neq('situacao', 'cancelado').order('quando', { ascending: true }).limit(1000);
    let { data, error } = await pedir(`${CAMPOS_BASE},${CAMPOS_REALIZADO}`);
    if (error && (error.code === '42703' || /realizado_/i.test(String(error.message || '')))) ({ data, error } = await pedir(CAMPOS_BASE));
    if (error) throw error;
    return data || [];
  }

  /* ------------------------------------------------------------------
     As regras do compromissos_nucleo.py, escritas aqui porque a tela do
     celular precisa das mesmas frases e das mesmas travas. Quem manda de
     verdade continua sendo o gatilho do banco.
     ------------------------------------------------------------------ */
  const fimDe = (c) => new Date(new Date(c.quando).getTime() + (Number(c.minutos) || 60) * 60000);
  // "passou" so depois do fim, como o estado_de do computador
  const terminou = (c, agora = new Date()) => fimDe(c) < agora;

  // "em 20 min", "hoje às 14:30", "amanhã às 14:00", "em 3 dias".
  // OS MINUTOS VEM ANTES DO DIA: a reuniao das 00:10 vista as 23:40 esta a
  // meia hora, e nao "amanha".
  function faltaDizer(c, agora = new Date()) {
    const ini = new Date(c.quando);
    if (Number.isNaN(ini.getTime())) return '';
    if (terminou(c, agora)) return 'já passou';
    if (ini <= agora) return 'agora';
    const minutos = Math.floor((ini - agora) / 60000);
    if (minutos < 60) return `em ${Math.max(1, minutos)} min`;
    const dias = L.diasEntre(L.isoDe(agora), L.isoDe(ini));
    if (dias === 0) return `hoje às ${L.horaBr(c.quando)}`;
    if (dias === 1) return `amanhã às ${L.horaBr(c.quando)}`;
    return `em ${dias} dias`;
  }

  // Quem vai, quem nao vai e quem nao respondeu: tres listas de NOMES.
  // O "nao respondeu" sai da lista de convidados, e nao da de respostas:
  // quem ficou calado e justamente quem precisa ser cobrado.
  function quemRespondeu(c) {
    const ids = c.participantes || [], nomes = c.nomes || [], resp = c.respostas || {};
    const vao = [], nao = [], calados = [];
    ids.forEach((id, i) => {
      const nome = nomes[i] || 'alguém';
      const r = String(resp[String(id)] || '');
      (r === 'vou' ? vao : r === 'nao_vou' ? nao : calados).push(nome);
    });
    return [vao, nao, calados];
  }

  // So o primeiro nome, e o sobrenome quando dois batem: encurtar uma Ana
  // e nao a outra e o que confunde de verdade.
  function nomesCurtos(nomes) {
    const primeiros = nomes.map((n) => L.primeiroNome(n) || n);
    const repetidos = new Set(primeiros.map((p) => p.toLowerCase()).filter((p, i, t) => t.indexOf(p) !== i));
    return nomes.map((n, i) => {
      const partes = String(n).trim().split(/\s+/);
      return repetidos.has(primeiros[i].toLowerCase()) && partes.length > 1 ? partes.slice(0, 2).join(' ') : primeiros[i];
    });
  }

  const foiRealizado = (c) => String(c.situacao || '') === 'realizado';
  const eDono = (c) => c.de === eu().id || !!eu().admin;

  // Da para dizer AGORA que aconteceu? QUEM: so quem marcou e o
  // administrador, porque registro que qualquer um escreve deixa de ser
  // registro. QUANDO: so depois de comecar; antes da hora o botao nem existe.
  const podeConfirmar = (c) => String(c.situacao || '') === 'marcado' && eDono(c) && new Date(c.quando) <= new Date();

  // "realizada · Ana, 21/09 às 15:02": quem e quando, e nao so um visto,
  // porque a pergunta que vem depois e "quem disse que aconteceu?".
  function realizadoDizer(c) {
    if (!foiRealizado(c)) return '';
    const partes = ['realizada'];
    const quem = L.primeiroNome(c.realizado_por_nome);
    if (quem) partes.push(quem);
    if (c.realizado_em) {
      const d = new Date(c.realizado_em);
      if (!Number.isNaN(d.getTime())) partes.push(`${L.dataHoraBr(c.realizado_em).slice(0, 5)} às ${L.horaBr(c.realizado_em)}`);
    }
    return partes.join(' · ');
  }
  async function pessoas() {
    const { data } = await N.sb.from('orc_chat_pessoas').select('id,nome,setor').order('nome');
    return data || [];
  }

  const tela = {
    titulo: 'Compromissos',
    aoTopo(dir) { dir.innerHTML = ''; dir.appendChild(UI.botaoTopo(ICONES.mais_circ, () => formulario(null), 'Marcar')); },
    async desenhar(el) {
      let passados = false, vivo = true;
      const desenharLista = async () => {
        if (!vivo) return;
        try {
          const hoje = L.hojeISO();
          const lista = passados ? (await listar(L.somarDias(hoje, -30), L.somarDias(hoje, -1))).reverse() : await listar(hoje, L.somarDias(hoje, 45));
          const meus = lista.filter((c) => L.eMeu(c, eu()) || eu().admin);
          APP.contagens.compromissos = L.osDeHoje(lista, eu()).length;
          const porDia = new Map();
          for (const c of meus) { const d = L.isoDe(new Date(c.quando)); (porDia.get(d) || porDia.set(d, []).get(d)).push(c); }
          el.innerHTML = `<div class="tabs"><button class="tab ${passados ? '' : 'on'}" data-v="0">Próximos</button><button class="tab ${passados ? 'on' : ''}" data-v="1">Passados (30 d)</button></div>
            ${meus.length ? '' : UI.vazio(passados ? 'Nada nos últimos 30 dias' : 'Nada marcado', passados ? '' : 'Toque em + para marcar.')}
            ${[...porDia.entries()].map(([dia, cs]) => `<div class="secao">${esc(UI.diaPorExtenso(dia))}${dia === hoje ? ' · hoje' : ''}</div><div class="lista">${cs.map((c) => {
              const e = L.estadoDoCompromisso(c);
              const minha = (c.respostas || {})[eu().id];
              const feito = foiRealizado(c);
              // o resumo do cartao do computador: tipo, lugar, setor, "X de Y
              // confirmaram" e quem marcou (so quando nao fui eu)
              const [vao, nao, calados] = quemRespondeu(c);
              const partes = [c.tipo, c.lugar, c.setor ? `setor ${c.setor}` : '',
                (c.participantes || []).length ? `${vao.length} de ${vao.length + nao.length + calados.length} confirmaram` : '',
                c.de !== eu().id && c.de_nome ? `marcado por ${c.de_nome}` : '',
                minha ? `você: ${minha === 'vou' ? 'vou' : 'não vou'}` : ''].filter(Boolean);
              // "ja passou" em todo cartao dos Passados e ruido; ali o que
              // interessa e o carimbo de quem confirmou
              const falta = terminou(c) ? '' : faltaDizer(c);
              return `<button class="linha ${e === 'agora' ? 'destaque' : ''}" type="button" data-id="${c.id}">
                <div class="linha__dir" style="align-items:flex-start;min-width:46px"><b style="font-size:15px;color:var(--black)">${esc(L.horaBr(c.quando))}</b><span>${c.minutos} min</span></div>
                <div class="linha__corpo"><div class="linha__titulo"><span class="t">${esc(c.titulo)}</span>${feito ? '<span class="badge b-ok">realizada</span>' : e === 'agora' ? '<span class="badge b-ok">agora</span>' : ''}</div>
                <div class="linha__sub">${falta ? `<b>${esc(falta)}</b> · ` : ''}${esc(partes.join(' · '))}</div>
                ${feito ? `<div class="linha__sub text-ok">✔ ${esc(realizadoDizer(c))}</div>` : ''}</div>${ICONES.seta}</button>`;
            }).join('')}</div>`).join('')}`;
          $$('.tab', el).forEach((b) => { b.onclick = () => { passados = b.dataset.v === '1'; desenharLista(); }; });
          $$('.linha', el).forEach((b) => { b.onclick = () => detalhe(lista.find((c) => c.id === Number(b.dataset.id)), desenharLista); });
        } catch (e) { if (vivo) el.innerHTML = `<div class="aviso erro">${esc(N.recado(e))}</div>`; }
      };
      await desenharLista();
      const relogio = setInterval(() => { if (!document.hidden) desenharLista(); }, 60000);
      tela._recarregar = desenharLista;
      return () => { vivo = false; clearInterval(relogio); tela._recarregar = null; };
    },
  };

  function detalhe(c, depois) {
    const dono = eDono(c);
    // SO QUEM FOI CONVIDADO RESPONDE, e so antes de acabar: e a regra do
    // cartao do computador. O setor inteiro ve o compromisso, mas "vou" e
    // resposta de quem foi chamado pelo nome; e dizer "vou" a uma reuniao
    // que ja terminou nao informa nada a ninguem.
    const convidado = (c.participantes || []).includes(eu().id);
    const resp = c.respostas || {};
    const minha = resp[eu().id];
    const feito = foiRealizado(c);
    const [vao, nao, calados] = quemRespondeu(c);
    const falta = faltaDizer(c);
    // QUEM CONFIRMOU, COM NOME: com "1 de 3 confirmaram" nao se faz nada;
    // quem marcou precisa saber de quem ainda espera resposta.
    const grupo = (rotulo, gente, cls) => gente.length ? `<div class="${cls}"><b>${rotulo}:</b> ${esc(nomesCurtos(gente).join(', '))}</div>` : '';
    const convidadosHtml = (c.participantes || []).length
      ? `<div>${vao.length} de ${vao.length + nao.length + calados.length} confirmaram</div>${grupo('Vão', vao, 'text-ok')}${grupo('Não vão', nao, 'text-err')}${grupo('Sem resposta', calados, 'text-muted')}${c.setor ? `<div class="text-muted">e o setor ${esc(c.setor)}</div>` : ''}`
      : (c.setor ? `setor ${esc(c.setor)}` : 'ninguém');
    const f = UI.folha(`
      <dl class="ficha">
        <div><dt>Quando</dt><dd>${esc(L.dataHoraBr(c.quando))} · ${c.minutos} min${falta ? ` · <b>${esc(falta)}</b>` : ''}</dd></div>
        <div><dt>Tipo</dt><dd>${esc(c.tipo)}</dd></div>
        ${c.lugar ? `<div><dt>Onde</dt><dd>${esc(c.lugar)}</dd></div>` : ''}
        <div><dt>Marcado por</dt><dd>${esc(c.de_nome)}</dd></div>
        <div class="largo"><dt>Convidados</dt><dd>${convidadosHtml}</dd></div>
        ${c.descricao ? `<div class="largo"><dt>Detalhes</dt><dd style="white-space:pre-wrap">${esc(c.descricao)}</dd></div>` : ''}
      </dl>
      ${convidado && !terminou(c) ? `<div class="mt16 text-muted">Você vai?</div><div class="acoes mt12"><button class="btn ${minha === 'vou' ? 'btn-ok' : 'btn-ghost'}" id="cd-vou" type="button">Vou</button><button class="btn ${minha === 'nao_vou' ? 'btn-danger' : 'btn-ghost'}" id="cd-naovou" type="button">Não vou</button></div>` : ''}
      ${feito ? `<div class="acoes mt16" style="align-items:center"><span class="text-ok fw7">✔ ${esc(realizadoDizer(c))}</span>${dono ? '<button class="btn btn-ghost" id="cd-desfazer" type="button">Desfazer</button>' : ''}</div>`
        : podeConfirmar(c) ? '<div class="acoes mt16"><button class="btn btn-ok" id="cd-realizada" type="button">✔ Foi realizada</button></div>' : ''}
      ${dono ? '<div class="acoes mt12"><button class="btn btn-ghost" id="cd-editar" type="button">Editar</button><button class="btn btn-ghost" id="cd-desmarcar" type="button" style="color:var(--red)">Desmarcar</button></div>' : ''}`,
      { titulo: c.titulo });
    const responder = async (v) => {
      const novas = { ...resp };
      if (minha === v) delete novas[eu().id]; else novas[eu().id] = v;
      try { await N.mudar('orc_compromissos', { id: c.id }, { respostas: novas }); toast('Anotado.', 'ok'); f.fechar(); depois(); }
      catch (e) { toast(N.recado(e), 'err'); }
    };
    const on = (id, fn) => { const b = $(id, f.caixa); if (b) b.onclick = fn; };
    on('#cd-vou', () => responder('vou'));
    on('#cd-naovou', () => responder('nao_vou'));
    on('#cd-editar', () => { f.fechar(); formulario(c); });
    on('#cd-realizada', () => realizar(c, true, f, depois));
    on('#cd-desfazer', () => realizar(c, false, f, depois));
    // DESMARCAR, e nao apagar: o computador so oferece isto. A linha fica
    // no banco com situacao "cancelado" e some da agenda de todo mundo.
    on('#cd-desmarcar', async () => {
      if (!await UI.confirmar(`Desmarcar “${c.titulo}”? Quem foi convidado deixa de ver na agenda.`, { ok: 'Desmarcar', cancelar: 'Voltar', perigo: true, titulo: 'Desmarcar' })) return;
      try { await N.mudar('orc_compromissos', { id: c.id }, { situacao: 'cancelado' }); N.registrar('compromisso_cancelado', c.titulo); f.fechar(); depois(); } catch (e) { toast(N.recado(e), 'err'); }
    });
  }

  // Carimba (ou desfaz) que o compromisso aconteceu. O SERVIDOR E QUEM
  // ASSINA: quem carimbou e a hora saem do gatilho do 58, e nao daqui.
  // DESFAZER PERGUNTA, confirmar nao: carimbar de menos se conserta com um
  // toque; apagar o registro de uma reuniao que aconteceu nao.
  async function realizar(c, feito, f, depois) {
    if (!feito && !await UI.confirmar(`Desfazer a confirmação de “${c.titulo}”? O registro de quem confirmou e quando se perde.`, { ok: 'Desfazer', cancelar: 'Voltar', perigo: true })) return;
    const alvo = feito ? 'realizado' : 'marcado';
    try {
      const novo = await N.mudar('orc_compromissos', { id: c.id }, { situacao: alvo });
      if (String(novo.situacao || '') !== alvo) {
        // o gatilho recusou calado (hora que nao chegou, ou quem nao
        // podia) e devolveu a linha como era: dizer isso e melhor do que a
        // tela voltar sozinha ao que era, sem explicacao
        toast('O servidor não aceitou: um compromisso só pode ser confirmado depois da hora marcada, e por quem o marcou.', 'err');
      } else {
        N.registrar(feito ? 'compromisso_realizado' : 'compromisso_reaberto', String(c.id));
        toast(feito ? 'Confirmado.' : 'Desfeito.', 'ok');
      }
      f.fechar(); depois();
    } catch (e) {
      // banco sem o 58: a trava antiga so conhece marcado e cancelado, e
      // o erro cru nao diz o que fazer
      toast(/compromisso_situacao/.test(String(e?.message || '')) ? 'Este servidor ainda não conhece a confirmação de compromisso realizado. Fale com o T.I. (falta rodar o 58-compromisso-realizado.sql).' : N.recado(e), 'err');
    }
  }

  async function formulario(c) {
    const gente = await pessoas().catch(() => []);
    const setores = [...new Set([...L.SETORES, ...gente.flatMap((p) => L.setoresDe(p))])].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const escolhidos = new Set(c?.participantes || []);
    const quandoLocal = c ? (() => { const d = new Date(c.quando); return `${L.isoDe(d)}T${L.horaBr(c.quando)}`; })() : `${L.hojeISO()}T09:00`;
    const f = UI.folha(`<form id="cf">
      <div class="fg"><label>Título</label><input id="cf-titulo" maxlength="200" required value="${esc(c?.titulo || '')}"></div>
      <div class="row-2">
        <div class="fg"><label>Tipo</label><select id="cf-tipo">${UI.opcoes(L.TIPOS_COMPROMISSO, c?.tipo || 'Reunião')}</select></div>
        <div class="fg"><label>Duração (min)</label><input id="cf-min" type="number" min="5" max="1440" value="${c?.minutos || 60}"></div>
      </div>
      <div class="fg"><label>Quando</label><input id="cf-quando" type="datetime-local" required value="${esc(quandoLocal)}"></div>
      <div class="fg"><label>Onde</label><input id="cf-lugar" maxlength="200" value="${esc(c?.lugar || '')}"></div>
      <div class="fg"><label>Avisar (minutos antes)</label><input id="cf-avisar" type="number" min="0" max="1440" value="${c?.avisar_minutos ?? 10}"></div>
      <div class="fg"><label>Convidados</label><div class="vistos" id="cf-gente">${gente.map((p) => `<button type="button" class="chip ${escolhidos.has(p.id) ? 'on' : ''}" data-id="${esc(p.id)}">${esc(L.primeiroNome(p.nome))}</button>`).join('')}</div></div>
      <div class="fg"><label>Ou o setor inteiro</label><select id="cf-setor">${UI.opcoes([['', 'nenhum'], ...setores.map((s) => [s, s])], c?.setor || '')}</select></div>
      <div class="fg"><label>Detalhes (não vão no e-mail)</label><textarea id="cf-desc" maxlength="4000">${esc(c?.descricao || '')}</textarea></div>
      <div class="modal-ft"><button class="btn btn-ok" type="submit">${c ? 'Salvar' : 'Marcar'}</button></div></form>`, { titulo: c ? 'Editar compromisso' : 'Marcar compromisso' });
    $$('#cf-gente .chip', f.caixa).forEach((b) => { b.onclick = () => { b.classList.toggle('on'); escolhidos.has(b.dataset.id) ? escolhidos.delete(b.dataset.id) : escolhidos.add(b.dataset.id); }; });
    $('#cf', f.caixa).onsubmit = async (e) => {
      e.preventDefault();
      const q = $('#cf-quando', f.caixa).value;
      if (!q) return toast('Diga quando.', 'err');
      const ids = [...escolhidos];
      const corpo = {
        titulo: L.achatar($('#cf-titulo', f.caixa).value).slice(0, 200),
        descricao: $('#cf-desc', f.caixa).value.trim().slice(0, 4000) || null,
        quando: L.paraServidor(new Date(q)),
        minutos: Math.max(5, Math.min(1440, Number($('#cf-min', f.caixa).value) || 60)),
        tipo: $('#cf-tipo', f.caixa).value,
        lugar: $('#cf-lugar', f.caixa).value.trim().slice(0, 200) || null,
        avisar_minutos: Math.max(0, Math.min(1440, Number($('#cf-avisar', f.caixa).value) || 0)),
        participantes: ids,
        nomes: ids.map((id) => gente.find((p) => p.id === id)?.nome || ''),
        setor: $('#cf-setor', f.caixa).value || null,
      };
      if (!corpo.titulo) return toast('Dê um título.', 'err');
      try {
        if (c) { await N.mudar('orc_compromissos', { id: c.id }, corpo); N.registrar('compromisso_mudado', corpo.titulo); }
        else {
          const { data, error } = await N.sb.from('orc_compromissos').insert({ ...corpo, de_nome: eu().nome }).select();
          if (error) throw error; if (!data?.length) throw new Error('O servidor não marcou.');
          N.registrar('compromisso_marcado', corpo.titulo);
        }
        toast(c ? 'Salvo.' : 'Marcado.', 'ok'); f.fechar(); if (tela._recarregar) tela._recarregar();
      } catch (err) { toast(N.recado(err), 'err'); }
    };
  }

  async function contar() {
    const hoje = L.hojeISO();
    return L.osDeHoje(await listar(hoje, hoje), eu()).length;
  }

  MODULOS.compromissos = {
    chave: 'compromissos', nome: 'Compromissos', sub: 'Reuniões, visitas, cobranças', icone: ICONES.compromissos, calmo: true,
    precisa: (u) => L.temModulo(u, 'compromissos'),
    abrir: () => UI.ir(tela),
    contar,
  };
})();
