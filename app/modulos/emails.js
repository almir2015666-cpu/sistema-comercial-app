/* =====================================================================
   E-mails da prospecção — o Controle de e-mails do computador no celular
   (prospeccao_tela.py, JanelaEmails / JanelaEnviarEmail / JanelaResponder).

   - A RESPONDER: a última mensagem da conversa é da empresa (💬). Toque,
     leia a conversa inteira e mande a resposta que a IA sugeriu (ou a sua).
   - AGUARDANDO: saiu a proposta, a empresa ainda não respondeu.
   - Cadastrar empresa (+) e mandar a "Proposta de parceria": a IA
     identifica a empresa (artigo, nome e segmentos) e o texto é o mesmo
     do computador.

   Quem manda, lê a caixa e chama a IA é a orc-email, no servidor — o app
   só pede. Mesmo visto do computador: Prospecção.
   ===================================================================== */
(() => {
  'use strict';
  const { $, $$, esc, toast, ICONES } = UI;
  const eu = () => N.estado.eu;
  const T = 'orc_emails_prospeccao';
  const FUNCAO = 'orc-email';
  const SELO = { 'Enviado': 'b-3', 'Não enviado': 'b-4', 'Respondeu': 'b-1', 'Sem interesse': 'b-gray',
    'Virou cliente': 'b-ok', 'E-mail voltou': 'b-4' };
  // quem já disse não, ou já é cliente, não recebe prospecção
  const NAO_MANDA = ['Sem interesse', 'Virou cliente'];

  async function funcaoEmail(corpo) {
    const { data, error } = await N.sb.functions.invoke(FUNCAO, { body: { ...corpo, ...(await N.onde()) } });
    if (error) throw new Error((await N.lerErroFuncao(error)) || 'A função do servidor não respondeu.');
    if (data && data.error) throw new Error(data.error);
    return data;
  }

  const listar = () => N.tudo((de, ate) => N.sb.from(T).select('*')
    .order('data', { ascending: false }).order('id', { ascending: false }).range(de, ate));

  async function lerConversa(id) {
    try {
      const { data, error } = await N.sb.from('orc_emails_conversa').select('*').eq('registro_id', id)
        .order('quando', { ascending: true }).order('id', { ascending: true });
      if (error) throw error;
      return data || [];
    } catch { return []; }      // sem o SQL 78: fica o que o registro guardou
  }

  // O modelo da proposta: o que a equipe salvou no computador, ou o de fábrica
  async function modeloParceria() {
    try {
      const { data } = await N.sb.from('orc_emails_modelos').select('*').eq('nome', L.MODELO_PARCERIA).limit(1);
      if (data?.length) return data[0];
    } catch { /* fica o de fábrica */ }
    return L.MODELOS_EMAIL[0];
  }

  const VISTAS = [['responder', 'A responder'], ['aguardando', 'Aguardando'], ['nao', 'Não enviados'], ['todos', 'Todos']];

  function filtrar(lista, vista, busca) {
    let s = lista;
    if (vista === 'responder') s = s.filter((r) => r.situacao === 'Respondeu' && L.vezDeQuem(r) === 'nos');
    else if (vista === 'aguardando') s = s.filter((r) => r.situacao === 'Enviado' || (r.situacao === 'Respondeu' && L.vezDeQuem(r) === 'empresa'));
    else if (vista === 'nao') s = s.filter((r) => r.situacao === 'Não enviado');
    const t = L.semAcento(busca).toLowerCase().trim();
    if (t) s = s.filter((r) => L.semAcento([r.empresa, r.contato, r.emails, r.telefones, r.observacao].join(' ')).toLowerCase().includes(t));
    return s;
  }

  const tela = {
    titulo: 'E-mails',
    aoTopo(dir) {
      dir.innerHTML = '';
      dir.appendChild(UI.botaoTopo(ICONES.mais_circ, () => novaEmpresa(), 'Cadastrar empresa'));
    },
    async desenhar(el) {
      let vista = 'responder', busca = '', vivo = true, lista = [];
      const desenhar = async (reler = true) => {
        if (!vivo) return;
        try {
          if (reler) lista = await listar();
          const achados = filtrar(lista, vista, busca);
          APP.contagens.emails = lista.filter((r) => r.situacao === 'Respondeu' && L.vezDeQuem(r) === 'nos').length;
          el.innerHTML = `<div class="tabs">${VISTAS.map(([k, r]) => `<button class="tab ${k === vista ? 'on' : ''}" data-v="${k}">${esc(r)}</button>`).join('')}</div>
            <div class="busca">${ICONES.busca}<input id="em-busca" placeholder="Procurar empresa, contato, e-mail" value="${esc(busca)}"></div>
            <button class="btn btn-ghost mt12" id="em-conferir" type="button">Conferir respostas na caixa</button>
            ${achados.length ? `<div class="lista">${achados.map((r) => {
              const vez = L.vezDeQuem(r);
              const sinal = vez === 'nos' ? '💬 ' : vez === 'empresa' ? '✔ ' : '';
              return `<button class="linha" type="button" data-id="${r.id}">
                ${UI.avatar(r.empresa || r.contato, 40)}
                <div class="linha__corpo"><div class="linha__titulo"><span class="t">${esc(sinal + (r.empresa || r.contato || '?'))}</span><span class="badge ${SELO[r.situacao] || 'b-gray'}">${esc(r.situacao)}</span></div>
                <div class="linha__sub">${esc(r.emails || 'sem e-mail')}</div>
                ${r.resposta_resumo || r.resposta_de ? `<div class="linha__sub">${esc(UI.quando(r.respondido_em))} · ${esc(r.resposta_resumo || r.resposta_de)}</div>` : ''}</div>${ICONES.seta}</button>`;
            }).join('')}</div>` : UI.vazio(vista === 'responder' ? 'Nenhuma empresa esperando resposta' : 'Nada aqui', vista === 'responder' ? 'Quando uma empresa responder, ela aparece aqui com a resposta sugerida.' : '')}`;
          $$('.tab', el).forEach((b) => { b.onclick = () => { vista = b.dataset.v; desenhar(false); }; });
          const inp = $('#em-busca', el);
          let t; inp.oninput = () => { clearTimeout(t); t = setTimeout(() => { busca = inp.value; const pos = inp.selectionStart; desenhar(false).then(() => { const i2 = $('#em-busca', el); i2.focus(); i2.setSelectionRange(pos, pos); }); }, 300); };
          $('#em-conferir', el).onclick = async () => {
            UI.carregando(true, 'Lendo a caixa da prospecção…');
            try {
              const r = await funcaoEmail({ acao: 'respostas' });
              const partes = [];
              if (r.responderam?.length) partes.push(`${r.responderam.length} empresa(s) com mensagem nova`);
              if (r.voltaram?.length) partes.push(`${r.voltaram.length} e-mail(s) voltaram`);
              if (r.sem_dono?.length) partes.push(`chegou e-mail de ${r.sem_dono.join(', ')}, que não bate com nenhum envio`);
              toast(partes.join(' · ') || 'Nenhuma resposta nova.', partes.length ? 'ok' : 'info', 6000);
            } catch (e) { toast(e.message, 'err'); }
            finally { UI.carregando(false); }
            desenhar();
          };
          $$('.linha', el).forEach((b) => { b.onclick = () => detalhe(lista.find((r) => r.id === Number(b.dataset.id)), desenhar); });
        } catch (e) { if (vivo) el.innerHTML = `<div class="aviso erro">${esc(N.recado(e))}</div>`; }
      };
      await desenhar();
      const relogio = setInterval(() => { if (!document.hidden && !busca) desenhar(); }, 30000);
      tela._recarregar = desenhar;
      return () => { vivo = false; clearInterval(relogio); tela._recarregar = null; };
    },
  };

  // A conversa, do jeito do computador: a empresa à esquerda, nós recuados
  function htmlConversa(msgs, r) {
    if (!msgs.length) {
      if (!r.resposta_de) return '<div class="text-muted pequeno">Ainda não há mensagens desta empresa.</div>';
      return `<div class="mt12"><div class="pequeno" style="color:var(--navy);font-weight:700">Empresa (${esc(r.resposta_de)})</div>
        <div style="white-space:pre-wrap;line-height:1.5">${esc(r.resposta_texto || '(o texto da resposta não foi lido)')}</div></div>`;
    }
    return msgs.map((m) => {
      const nos = m.direcao === 'enviado';
      return `<div class="mt12" style="${nos ? 'margin-left:24px;opacity:.85' : ''}">
        <div class="pequeno" style="font-weight:700;color:${nos ? 'var(--ok, #1f8a4c)' : 'var(--navy)'}">${nos ? `Nós${m.enviado_por ? ` (${esc(L.primeiroNome(m.enviado_por))})` : ''}` : `Empresa (${esc(m.de || '?')})`} · ${esc(L.dataHoraBr(m.quando))}</div>
        <div style="white-space:pre-wrap;line-height:1.5">${esc(m.texto || '')}</div></div>`;
    }).join('');
  }

  async function detalhe(r, depois) {
    const vez = L.vezDeQuem(r);
    const fones = String(r.telefones || '').split(/[,;/]+/).map((t) => t.trim()).filter(Boolean);
    const f = UI.folha(`
      <div><span class="badge ${SELO[r.situacao] || 'b-gray'}">${esc(r.situacao)}</span>${vez === 'nos' ? ' <span class="badge b-1">💬 a vez é nossa</span>' : ''}</div>
      <dl class="ficha mt12">
        ${r.contato ? `<div><dt>Contato</dt><dd>${esc(r.contato)}</dd></div>` : ''}
        <div class="largo"><dt>E-mails</dt><dd>${L.emailsDe(r.emails).map((e) => `<a href="mailto:${esc(e)}">${esc(e)}</a>`).join('<br>') || 'nenhum'}</dd></div>
        ${fones.length ? `<div class="largo"><dt>Telefones</dt><dd>${fones.map((t) => `<a href="tel:${esc(t.replace(/\D/g, ''))}">${esc(t)}</a>`).join('<br>')}</dd></div>` : ''}
        ${r.cnpj ? `<div><dt>CNPJ</dt><dd>${esc(r.cnpj)}</dd></div>` : ''}
        ${r.resposta_resumo ? `<div class="largo"><dt>O que a empresa quis</dt><dd>${esc(r.resposta_resumo)}</dd></div>` : ''}
        ${r.observacao ? `<div class="largo"><dt>Observação</dt><dd>${esc(r.observacao)}</dd></div>` : ''}
      </dl>
      <div class="acoes mt16">
        ${r.resposta_de ? '<button class="btn btn-ok" id="ed-responder" type="button">💬 Responder</button>' : ''}
        ${!NAO_MANDA.includes(r.situacao) && L.emailsDe(r.emails).length && !r.resposta_de ? `<button class="btn btn-ok" id="ed-proposta" type="button">${r.situacao === 'Não enviado' ? 'Enviar proposta' : 'Enviar de novo'}</button>` : ''}
        <button class="btn btn-ghost" id="ed-situacao" type="button">Mudar situação</button>
      </div>
      <div class="mt16"><div class="pequeno text-muted" style="font-weight:700">CONVERSA</div><div id="ed-conversa" class="text-muted pequeno">lendo…</div></div>`,
    { titulo: r.empresa || r.contato || 'Empresa' });
    lerConversa(r.id).then((msgs) => { const c = $('#ed-conversa', f.caixa); if (c) { c.className = ''; c.innerHTML = htmlConversa(msgs, r); } });
    const on = (id, fn) => { const b = $(id, f.caixa); if (b) b.onclick = fn; };
    on('#ed-responder', () => { f.fechar(); responder(r, depois); });
    on('#ed-proposta', () => { f.fechar(); enviarProposta(r, depois); });
    on('#ed-situacao', async () => {
      const nova = await escolherSituacao(r.situacao);
      if (!nova || nova === r.situacao) return;
      try {
        await N.mudar(T, { id: r.id }, { situacao: nova, atualizado_por: eu().nome });
        N.registrar('email_prospeccao_alterado', `${r.empresa || r.contato} · ${nova}`);
        toast('Situação mudada.', 'ok'); f.fechar(); depois();
      } catch (e) { toast(N.recado(e), 'err'); }
    });
  }

  function escolherSituacao(atual) {
    return new Promise((ok) => {
      const f = UI.folha(`<div class="lista">${L.SITUACOES_EMAIL.map((s) => `<button class="linha" type="button" data-s="${esc(s)}"><div class="linha__corpo"><div class="linha__titulo"><span class="t">${esc(s)}</span>${s === atual ? '<span class="badge b-gray">atual</span>' : ''}</div></div></button>`).join('')}</div>`,
        { titulo: 'Mudar situação', aoFechar: () => ok(null) });
      $$('.linha', f.caixa).forEach((b) => { b.onclick = () => { ok(b.dataset.s); f.fechar(); }; });
    });
  }

  /* -------------------------------------------- responder a empresa */
  async function responder(r, depois) {
    const base = r.resposta_assunto || 'Proposta de parceria';
    const f = UI.folha(`
      <div id="er-conversa" class="text-muted pequeno">lendo a conversa…</div>
      <form id="er-form" class="mt16">
        <div class="fg"><label>Assunto</label><input id="er-assunto" value="${esc(/^re:/i.test(base) ? base : `Re: ${base}`)}"></div>
        <div class="fg"><label>Sua resposta <span class="text-muted">(sugerida pela IA — revise)</span></label>
          <textarea id="er-texto" rows="10" maxlength="8000">${esc(r.sugestao_resposta || '')}</textarea>
          <div class="dica">Sai da caixa da prospecção para ${esc(r.resposta_de || '?')}, na mesma conversa.</div></div>
        <div class="modal-ft"><button class="btn btn-ghost" id="er-sugerir" type="button">Sugerir de novo (IA)</button><button class="btn btn-ok" type="submit">Enviar resposta</button></div>
      </form>`, { titulo: `Responder ${r.empresa || r.contato || ''}` });
    lerConversa(r.id).then((msgs) => { const c = $('#er-conversa', f.caixa); if (c) { c.className = ''; c.innerHTML = htmlConversa(msgs, r); } });
    const sugerir = async () => {
      UI.carregando(true, 'A IA está escrevendo a sugestão…');
      try {
        const s = await funcaoEmail({ acao: 'sugerir', id: r.id });
        Object.assign(r, s);
        $('#er-texto', f.caixa).value = s.sugestao_resposta || '';
        toast('Sugestão pronta. Revise antes de enviar.', 'ok');
      } catch (e) { toast(e.message, 'err'); }
      finally { UI.carregando(false); }
    };
    $('#er-sugerir', f.caixa).onclick = sugerir;
    if (!r.sugestao_resposta) sugerir();
    $('#er-form', f.caixa).onsubmit = async (e) => {
      e.preventDefault();
      const texto = $('#er-texto', f.caixa).value.trim();
      if (!texto) return toast('Escreva a resposta.', 'err');
      if (!(await UI.confirmar(`Enviar esta resposta para ${r.resposta_de}?`, { ok: 'Enviar' }))) return;
      UI.carregando(true, 'Enviando…');
      try {
        await funcaoEmail({ acao: 'responder', id: r.id, assunto: $('#er-assunto', f.caixa).value.trim(), mensagem: texto });
        toast('Resposta enviada. Quando a empresa responder de volta, aparece na conversa.', 'ok', 5000);
        f.fechar(); depois();
      } catch (err) { toast(err.message, 'err'); }
      finally { UI.carregando(false); }
    };
  }

  /* ------------------------------------- a proposta de parceria (IA) */
  async function enviarProposta(r, depois) {
    const modelo = await modeloParceria();
    const f = UI.folha(`
      <div class="aviso info" id="ep-aviso">A IA está identificando a empresa…</div>
      <form id="ep-form" class="mt12">
        <div class="fg"><label>Artigo</label><select id="ep-artigo">${UI.opcoes(['o', 'a', '(nenhum)'], r.ia_artigo || (r.ia_em ? '(nenhum)' : 'a'))}</select></div>
        <div class="fg"><label>Nome da empresa no texto</label><input id="ep-nome" value="${esc(r.ia_nome || r.empresa || '')}"></div>
        <div class="fg"><label>Nome curto (as outras vezes)</label><input id="ep-curto" value="${esc(r.ia_nome_curto || '')}"></div>
        <div class="fg"><label>Segmentos em que atua</label><textarea id="ep-seg" rows="3">${esc(r.ia_segmentos || '')}</textarea><div class="dica">Ex.: terceirização de mão de obra, limpeza e conservação e facilities.</div></div>
        <div class="pequeno text-muted mt12" style="font-weight:700">COMO A EMPRESA VAI RECEBER</div>
        <div id="ep-previa" class="mt12" style="border:1px solid var(--line, #dfe6ee);border-radius:10px;padding:12px;line-height:1.5;font-size:14px"></div>
        <div class="modal-ft"><button class="btn btn-ok" type="submit">Enviar para ${L.emailsDe(r.emails).length} endereço(s)</button></div>
      </form>`, { titulo: `Proposta para ${r.empresa || r.contato}` });
    const campos = () => {
      const art = $('#ep-artigo', f.caixa).value;
      return { ...r, ia_artigo: art === '(nenhum)' ? '' : art, ia_nome: $('#ep-nome', f.caixa).value.trim(),
        ia_nome_curto: $('#ep-curto', f.caixa).value.trim(), ia_segmentos: $('#ep-seg', f.caixa).value.trim().replace(/\.$/, '') };
    };
    const previa = () => {
      const c = campos();
      $('#ep-previa', f.caixa).innerHTML = `<div style="font-weight:800;margin-bottom:8px">${esc(L.preencherModelo(modelo.assunto, c, eu().nome))}</div>${L.marcacaoEmHtml(L.preencherModelo(modelo.corpo, c, eu().nome), esc)}`;
    };
    $$('input,select,textarea', f.caixa).forEach((i) => { i.oninput = previa; i.onchange = previa; });
    previa();
    const aviso = $('#ep-aviso', f.caixa);
    if (L.faltaIa(r)) {
      try {
        const ia = await funcaoEmail({ acao: 'redigir', id: r.id });
        Object.assign(r, ia);
        $('#ep-artigo', f.caixa).value = ia.ia_artigo || '(nenhum)';
        $('#ep-nome', f.caixa).value = ia.ia_nome || '';
        $('#ep-curto', f.caixa).value = ia.ia_nome_curto || '';
        $('#ep-seg', f.caixa).value = ia.ia_segmentos || '';
        aviso.className = ia.conhecida ? 'aviso info' : 'aviso atencao';
        aviso.textContent = ia.conhecida ? 'Identificada pela IA. Confira antes de enviar.' : 'A IA não conhece esta empresa: confira os segmentos.';
        previa();
      } catch (e) { aviso.className = 'aviso atencao'; aviso.textContent = `${e.message} Escreva os segmentos à mão.`; }
    } else aviso.textContent = 'Identificada pela IA. Confira antes de enviar.';

    $('#ep-form', f.caixa).onsubmit = async (e) => {
      e.preventDefault();
      const c = campos();
      if (L.faltaIa(c)) return toast('Escreva os segmentos em que a empresa atua.', 'err');
      if (!(await UI.confirmar(`Enviar a proposta para ${L.emailsDe(r.emails).join(', ')}?`, { ok: 'Enviar' }))) return;
      UI.carregando(true, 'Enviando…');
      try {
        // a correção da equipe fica gravada no registro, como no computador
        await N.mudar(T, { id: r.id }, { ia_artigo: c.ia_artigo, ia_nome: c.ia_nome || null, ia_nome_curto: c.ia_nome_curto || null,
          ia_segmentos: c.ia_segmentos, atualizado_por: eu().nome });
        const resp = await funcaoEmail({ acao: 'prospeccao', id: r.id, assunto: L.preencherModelo(modelo.assunto, c, eu().nome),
          mensagem: L.preencherModelo(modelo.corpo, c, eu().nome), cobranca: false, dias_cobrar: 7 });
        toast(resp.falharam?.length ? `Enviado, mas não foi para ${resp.falharam.join(', ')}.` : 'Proposta enviada.', resp.falharam?.length ? 'err' : 'ok', 5000);
        f.fechar(); depois();
      } catch (err) { toast(err.message, 'err'); }
      finally { UI.carregando(false); }
    };
  }

  /* ---------------------------------------------- cadastrar empresa */
  function novaEmpresa() {
    const f = UI.folha(`<form id="ne">
      <div class="fg"><label>Empresa</label><input id="ne-empresa" maxlength="160" required></div>
      <div class="fg"><label>Contato</label><input id="ne-contato" maxlength="120"></div>
      <div class="fg"><label>E-mails</label><input id="ne-emails" inputmode="email" autocapitalize="off" placeholder="rh@empresa.com, sesmt@empresa.com"><div class="dica">Vários: separe por vírgula.</div></div>
      <div class="fg"><label>Telefones</label><input id="ne-fones" inputmode="tel"></div>
      <div class="fg"><label>CNPJ</label><input id="ne-cnpj" inputmode="numeric"><div class="dica">Opcional — ajuda a IA a identificar empresa pequena.</div></div>
      <div class="modal-ft"><button class="btn btn-ok" type="submit">Cadastrar</button></div></form>`, { titulo: 'Nova empresa' });
    $('#ne', f.caixa).onsubmit = async (e) => {
      e.preventDefault();
      const v = (id) => $(id, f.caixa).value.trim();
      const brutos = v('#ne-emails').split(/[,;\s]+/).filter(Boolean);
      const emails = L.emailsDe(v('#ne-emails'));
      if (brutos.length !== emails.length) return toast('Algum e-mail não parece e-mail. Separe vários por vírgula.', 'err');
      const cnpj = v('#ne-cnpj').replace(/\D/g, '');
      if (cnpj && cnpj.length !== 14) return toast('CNPJ são 14 números (ou deixe em branco).', 'err');
      // o aviso de "já recebeu" do computador
      try {
        if (emails.length) {
          const { data } = await N.sb.from(T).select('empresa,situacao,emails').neq('situacao', 'Não enviado').limit(5000);
          const ja = (data || []).find((x) => L.emailsDe(x.emails).some((m) => emails.includes(m)));
          if (ja && !(await UI.confirmar(`${ja.empresa || 'Esta empresa'} já recebeu e-mail (${ja.situacao}). Cadastrar mesmo assim?`, { ok: 'Cadastrar' }))) return;
        }
        const { data, error } = await N.sb.from(T).insert({
          empresa: v('#ne-empresa'), contato: v('#ne-contato') || null, emails: emails.join(', ') || null,
          telefones: v('#ne-fones') || null, cnpj: cnpj || null, data: L.hojeISO(), situacao: 'Não enviado',
          criado_por: eu().id, criado_por_nome: eu().nome, atualizado_por: eu().nome,
        }).select();
        if (error) throw error;
        N.registrar('email_prospeccao_novo', `${v('#ne-empresa')} <${emails.join(', ') || 'sem e-mail'}>`);
        f.fechar();
        if (tela._recarregar) tela._recarregar();
        if (emails.length && data?.length && await UI.confirmar('Empresa cadastrada. Enviar a proposta de parceria agora?', { ok: 'Enviar proposta', cancelar: 'Depois' })) {
          enviarProposta(data[0], () => tela._recarregar && tela._recarregar());
        } else toast('Empresa cadastrada.', 'ok');
      } catch (err) { toast(N.recado(err), 'err'); }
    };
  }

  async function contar() {
    const { data, error } = await N.sb.from(T).select('id,respondido_em,respondemos_em').eq('situacao', 'Respondeu').limit(2000);
    if (error) throw error;
    return (data || []).filter((r) => L.vezDeQuem(r) === 'nos').length;
  }

  MODULOS.emails = {
    chave: 'emails', nome: 'E-mails', sub: 'Prospecção: respostas e propostas', icone: ICONES.emails,
    // o mesmo visto do computador: o Controle de e-mails é da Prospecção
    precisa: (u) => L.temModulo(u, 'prospeccao'),
    abrir: () => UI.ir(tela),
    contar,
  };
})();
