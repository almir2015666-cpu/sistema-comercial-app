/* =====================================================================
   Compromissos — reuniao, visita, cobranca, com hora e convidados.
   Quem nao marcou so consegue responder a propria presenca: o gatilho do
   banco devolve todo o resto ao valor antigo. Os e-mails de lembrete
   continuam saindo do programa do computador, nao daqui.
   ===================================================================== */
(() => {
  'use strict';
  const { $, $$, esc, toast, ICONES } = UI;
  const CAMPOS = 'id,titulo,descricao,quando,minutos,tipo,lugar,de,de_nome,participantes,nomes,setor,respostas,avisar_minutos,email_vespera,email_perto,situacao,criado_em';
  const eu = () => N.estado.eu;

  async function listar(deISO, ateISO, comCancelados) {
    let q = N.sb.from('orc_compromissos').select(CAMPOS).gte('quando', `${deISO}T00:00:00`).lte('quando', `${ateISO}T23:59:59`).order('quando', { ascending: true }).limit(1000);
    if (!comCancelados) q = q.eq('situacao', 'marcado');
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
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
          const lista = passados ? (await listar(L.somarDias(hoje, -30), L.somarDias(hoje, -1), true)).reverse() : await listar(hoje, L.somarDias(hoje, 45), false);
          const meus = lista.filter((c) => L.eMeu(c, eu()) || eu().admin);
          APP.contagens.compromissos = L.osDeHoje(lista, eu()).length;
          const porDia = new Map();
          for (const c of meus) { const d = L.isoDe(new Date(c.quando)); (porDia.get(d) || porDia.set(d, []).get(d)).push(c); }
          el.innerHTML = `<div class="tabs"><button class="tab ${passados ? '' : 'on'}" data-v="0">Próximos</button><button class="tab ${passados ? 'on' : ''}" data-v="1">Passados (30 d)</button></div>
            ${meus.length ? '' : UI.vazio(passados ? 'Nada nos últimos 30 dias' : 'Nada marcado', passados ? '' : 'Toque em + para marcar.')}
            ${[...porDia.entries()].map(([dia, cs]) => `<div class="secao">${esc(UI.diaPorExtenso(dia))}${dia === hoje ? ' · hoje' : ''}</div><div class="lista">${cs.map((c) => {
              const e = L.estadoDoCompromisso(c);
              const minha = (c.respostas || {})[eu().id];
              return `<button class="linha ${e === 'agora' ? 'destaque' : ''}" type="button" data-id="${c.id}">
                <div class="linha__dir" style="align-items:flex-start;min-width:46px"><b style="font-size:15px;color:var(--black)">${esc(L.horaBr(c.quando))}</b><span>${c.minutos} min</span></div>
                <div class="linha__corpo"><div class="linha__titulo"><span class="t ${c.situacao === 'cancelado' ? 'text-muted' : ''}">${esc(c.titulo)}</span>${c.situacao === 'cancelado' ? '<span class="badge b-gray">cancelado</span>' : e === 'agora' ? '<span class="badge b-ok">agora</span>' : ''}</div>
                <div class="linha__sub">${esc(c.tipo)}${c.lugar ? ` · ${esc(c.lugar)}` : ''} · ${esc(c.de_nome)}${minha ? ` · você: ${minha === 'vou' ? 'vou' : 'não vou'}` : ''}</div></div>${ICONES.seta}</button>`;
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
    const dono = c.de === eu().id || eu().admin;
    const convidado = (c.participantes || []).includes(eu().id) || (c.setor && L.eDoSetor(eu(), c.setor));
    const resp = c.respostas || {};
    const minha = resp[eu().id];
    const f = UI.folha(`
      <dl class="ficha">
        <div><dt>Quando</dt><dd>${esc(L.dataHoraBr(c.quando))} · ${c.minutos} min</dd></div>
        <div><dt>Tipo</dt><dd>${esc(c.tipo)}</dd></div>
        <div><dt>Onde</dt><dd>${esc(c.lugar || '—')}</dd></div>
        <div><dt>Marcado por</dt><dd>${esc(c.de_nome)}</dd></div>
        <div class="largo"><dt>Convidados</dt><dd>${(c.nomes || []).map((n, i) => { const r = resp[(c.participantes || [])[i]]; return `${esc(n)}${r ? ` <span class="badge ${r === 'vou' ? 'b-ok' : 'b-gray'}">${r === 'vou' ? 'vai' : 'não vai'}</span>` : ''}`; }).join(', ') || (c.setor ? `setor ${esc(c.setor)}` : '—')}</dd></div>
        ${c.descricao ? `<div class="largo"><dt>Detalhes</dt><dd style="white-space:pre-wrap">${esc(c.descricao)}</dd></div>` : ''}
      </dl>
      ${c.situacao === 'marcado' && (convidado || dono) ? `<div class="acoes mt16"><button class="btn ${minha === 'vou' ? 'btn-ok' : 'btn-ghost'}" id="cd-vou" type="button">Vou</button><button class="btn ${minha === 'nao_vou' ? 'btn-danger' : 'btn-ghost'}" id="cd-naovou" type="button">Não vou</button></div>` : ''}
      ${dono ? `<div class="acoes mt12">${c.situacao === 'marcado' ? `<button class="btn btn-ghost" id="cd-editar" type="button">Editar</button><button class="btn btn-ghost" id="cd-cancelar" type="button">Cancelar</button>` : ''}<button class="btn btn-ghost" id="cd-apagar" type="button" style="color:var(--red)">Apagar</button></div>` : ''}`,
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
    on('#cd-cancelar', async () => {
      if (!await UI.confirmar('Cancelar este compromisso? Os convidados deixam de vê-lo como marcado.', { ok: 'Cancelar compromisso', cancelar: 'Voltar', perigo: true })) return;
      try { await N.mudar('orc_compromissos', { id: c.id }, { situacao: 'cancelado' }); N.registrar('compromisso_cancelado', c.titulo); f.fechar(); depois(); } catch (e) { toast(N.recado(e), 'err'); }
    });
    on('#cd-apagar', async () => {
      if (!await UI.confirmar('Apagar de vez?', { ok: 'Apagar', perigo: true })) return;
      try { const n = await N.apagar('orc_compromissos', { id: c.id }); if (!n) throw new Error('O servidor não deixou apagar.'); N.registrar('compromisso_apagado', c.titulo); f.fechar(); depois(); }
      catch (e) { toast(N.recado(e), 'err'); }
    });
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
    return L.osDeHoje(await listar(hoje, hoje, false), eu()).length;
  }

  MODULOS.compromissos = {
    chave: 'compromissos', nome: 'Compromissos', sub: 'Reuniões, visitas, cobranças', icone: ICONES.compromissos, calmo: true,
    precisa: (u) => L.temModulo(u, 'compromissos'),
    abrir: () => UI.ir(tela),
    contar,
  };
})();
