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
      <div class="secao">Botões</div><div class="lista-vistos">${L.BOTOES.map(([k, n]) => `<label class="visto"><input type="checkbox" data-mod="${k}" ${marcados.has(k) ? 'checked' : ''}> ${esc(n)}${k === 'conferencia' || L.NO_CELULAR.includes(k) ? ' <span class="badge b-3">celular</span>' : ''}</label>`).join('')}</div>
      <div class="secao">Dentro dos módulos</div><div class="lista-vistos">${L.DENTRO.map(([k, m, n]) => `<label class="visto"><input type="checkbox" data-mod="${k}" ${marcados.has(k) ? 'checked' : ''}> ${esc((L.MODULOS.find(([c]) => c === m) || [, m])[1])}: ${esc(n)}</label>`).join('')}</div>
      <div class="modal-ft"><button class="btn btn-ok" type="submit">${novo ? 'Criar acesso' : 'Salvar'}</button></div>
      ${novo ? '' : `<div class="acoes mt12"><button class="btn btn-ghost" type="button" id="uf-senha">Nova senha</button>${souEu ? '' : `<button class="btn btn-ghost" type="button" id="uf-bloq" style="color:${u.ativo ? 'var(--red)' : 'var(--green)'}">${u.ativo ? 'Bloquear acesso' : 'Liberar acesso'}</button>`}</div>`}
    </form>`, { titulo: novo ? 'Criar acesso' : u.nome });
    $$('[data-set]', f.caixa).forEach((b) => { b.onclick = () => { b.classList.toggle('on'); setores.has(b.dataset.set) ? setores.delete(b.dataset.set) : setores.add(b.dataset.set); }; });

    $('#uf', f.caixa).onsubmit = async (e) => {
      e.preventDefault();
      const usuario = L.loginDe($('#uf-usuario', f.caixa).value), nome = L.achatar($('#uf-nome', f.caixa).value);
      const cargo = L.achatar($('#uf-cargo', f.caixa).value), profissao = L.achatar($('#uf-prof', f.caixa).value), registro = L.achatar($('#uf-reg', f.caixa).value);
      const admin = $('#uf-admin', f.caixa).checked;
      const marcadosAgora = $$('input[data-mod]:checked', f.caixa).map((i) => i.dataset.mod).filter((k) => !k.includes(':') || $$('input[data-mod]:checked', f.caixa).some((i) => i.dataset.mod === k.split(':')[0]));
      // o que o app não desenha fica como estava: ver L.juntarModulos
      const mods = L.juntarModulos(u?.modulos, marcadosAgora);
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
  // AS FRASES DO COMPUTADOR (app.py, ACOES_LOG), copiadas tal qual: o
  // Log do celular e o do computador dizem a mesma coisa da mesma acao.
  // As do app (abaixo) valem por cima, onde ja existiam.
  const ACOES_DO_COMPUTADOR = {"acesso_bloqueado": "Acesso bloqueado", "acesso_carta": "Carta de acesso gerada (PDF com a senha inicial)", "acesso_homologacao_vencido": "Acesso da homologação desligado por prazo", "acesso_liberado": "Acesso liberado", "acesso_rh_vencido": "Acesso de RH desligado por prazo", "agenda_alterada": "Agenda dos médicos alterada", "agenda_pdf": "Agenda em PDF", "agendamento_aberto": "Ficha de agendamento aberta", "agendamento_pdf": "Comprovante de agendamento em PDF", "agendamento_relatorio": "Relatório de agendamentos", "agendamento_salvo": "Agendamento salvo", "agendamento_situacao": "Situação do agendamento mudou", "almox_cancelada": "Requisição cancelada", "almox_deposito": "Depósito do almoxarifado criado", "almox_enviada": "Requisição enviada ao setor (o estoque baixou)", "almox_item": "Item do almoxarifado cadastrado ou alterado", "almox_movimento": "Estoque movimentado (entrada, saída, ajuste ou transferência)", "almox_nota": "Nota do fornecedor guardada no almoxarifado", "almox_nota_lancada": "Nota do fornecedor lançada no estoque", "almox_recebida": "Chegada da requisição confirmada pelo setor", "almox_requisicao": "Requisição de material aberta", "almoxarifado_aberto": "Almoxarifado aberto", "atualizacao_baixada": "Versão nova baixada nesta máquina", "atualizacao_recusada": "Atualização RECUSADA (assinatura não confere)", "backup_feito": "Backup dos dados gravado no computador", "catalogo_alterado": "Catálogo alterado", "catalogo_semeado": "Catálogo enviado para a nuvem", "chamado_aberto": "Chamado aberto para o T.I.", "chamado_atendido": "Chamado pego pelo T.I.", "chamado_cancelado": "Chamado cancelado por quem abriu", "chamado_corrigido": "Chamado corrigido por quem abriu", "chamado_devolvido": "Chamado devolvido à fila", "chamado_pendente": "Chamado marcado como pendente (esperando algo de fora)", "chamado_resolvido": "Chamado resolvido", "chamados_aberto": "Chamados T.I. aberto", "compromisso_apagado": "Compromisso apagado", "compromisso_cancelado": "Compromisso desmarcado", "compromisso_marcado": "Compromisso marcado", "compromisso_mudado": "Compromisso corrigido", "compromissos_aberto": "Compromissos aberto", "compromissos_imprimiu": "Compromissos impresso", "conferencia_aberta": "Conferência aberta", "conferencia_alterou": "Serviço alterado", "conferencia_apagou_escolhidos": "Serviços apagados da Conferência", "conferencia_exportou": "Conferência exportada para Excel", "conferencia_importou": "Planilha antiga importada", "conferencia_novo": "Serviço protocolado", "conferencia_pgr_liberado": "PGR liberado pela segurança do trabalho", "conferencia_planilha_apagada": "Planilha antiga apagada da Conferência", "contrato_aberto": "Contrato aberto", "contrato_anexo": "Anexo juntado ao contrato", "contrato_gerado": "Contrato gerado em PDF", "contrato_pdf_aberto": "PDF do contrato aberto", "contrato_salvo": "Contrato salvo", "contrato_salvo_como_novo": "Salvou por cima: virou contrato novo", "diario_aberto": "Diário de Bordo aberto", "diario_apagado": "Registro do Diário apagado", "diario_exportou": "Relatório do Diário exportado em planilha", "diario_metas_alteradas": "Metas do Diário alteradas", "diario_registrado": "Dia registrado no Diário de Bordo", "documento_aberto": "Contrato assinado aberto", "documento_anexado": "Contrato assinado anexado", "documento_apagado": "Contrato tirado da lista", "documento_restaurado": "Contrato devolvido à lista", "empresa_desativada": "Empresa tirada da lista", "empresa_salva": "Empresa cadastrada ou alterada", "empresas_aberto": "Cadastro de empresas aberto", "entrou": "Entrou no sistema", "fin_aberto": "Financeiro aberto", "fin_acordo_apagado": "Acordo excluído (com as parcelas)", "fin_acordo_criado": "Acordo criado (com as parcelas)", "fin_baixa": "Baixa dada (pagamento registrado)", "fin_baixa_desfeita": "Baixa desfeita: voltou a pendente", "fin_categoria_apagada": "Categoria financeira tirada", "fin_categoria_salva": "Categoria financeira criada", "fin_centro_custo_apagado": "Centro de custo tirado", "fin_centro_custo_salvo": "Centro de custo criado", "fin_exportou": "Financeiro exportado para Excel", "fin_fixas_repetidas": "Despesas fixas repetidas do mês anterior", "fin_imprimiu": "Financeiro impresso", "fin_lancamento_alterado": "Lançamento financeiro alterado", "fin_lancamento_apagado": "Lançamento financeiro apagado", "fin_lancamento_criado": "Lançamento financeiro criado", "fin_planilha_importada": "Planilha de contas a pagar importada", "fin_prestador_apagado": "Prestador excluído", "fin_prestador_desligado": "Prestador desativado", "fin_prestador_ligado": "Prestador ativado", "fin_prestador_salvo": "Prestador cadastrado ou alterado", "fin_prestadores_lancados": "Prestadores lançados no mês", "funcao_falhou": "Função do servidor FALHOU", "homologacao_aberto": "Homologação aberta (contratos e acessos)", "homologacao_acesso_desligado": "Acesso da homologação desligado", "homologacao_acesso_editado": "Acesso da homologação editado", "homologacao_acesso_religado": "Acesso da homologação religado", "homologacao_anexos_copiados": "Anexos da homologação copiados no backup", "homologacao_colaborador_criado": "Colaborador da empresa cadastrado (homologação)", "homologacao_colaborador_desligado": "Colaborador da empresa desligado (homologação)", "homologacao_colaborador_editado": "Colaborador da empresa editado (homologação)", "homologacao_colaborador_religado": "Colaborador da empresa religado (homologação)", "homologacao_colaboradores_importados": "Colaboradores importados de uma planilha (homologação)", "homologacao_filial_criada": "Filial da empresa cadastrada (homologação)", "homologacao_filial_desligada": "Filial da empresa desligada (homologação)", "homologacao_filial_religada": "Filial da empresa religada (homologação)", "homologacao_filial_renomeada": "Filial da empresa renomeada (homologação)", "homologacao_login_criado": "Login do RH na homologação criado", "homologacao_pdf_enviado": "Carta de acesso da homologação enviada", "homologacao_senha_nova": "Senha nova para o RH na homologação", "login_falhou": "Login que não passou", "meta_alterada": "Meta de alguém alterada", "modulos_alterados": "Módulos liberados alterados", "orcamento_aberto": "Orçamento aberto", "orcamento_copiado": "Orçamento copiado para um novo", "orcamento_salvo": "Orçamento salvo", "orcamento_salvo_como_novo": "Salvou por cima: virou orçamento novo", "paciente_historico": "Histórico de um paciente consultado", "pdf_gerado": "PDF gerado", "pop_aberto": "POP aberto", "receber_aberto": "Contas a receber aberto", "receber_exportou": "Contas a receber exportado para Excel", "receber_imprimiu": "Contas a receber impresso", "relatorio_aberto": "Relatórios abertos", "resumo_enviado": "Resumo do dia enviado por e-mail", "saiu": "Saiu do sistema", "segundo_fator_desligado": "Verificação em duas etapas DESLIGADA", "segundo_fator_ligado": "Verificação em duas etapas LIGADA", "senha_clinica_definida": "Senha da clínica definida", "senha_clinica_guardada": "Senha da clínica guardada no cofre do servidor", "senha_redefinida": "Senha redefinida", "senha_trocada": "Trocou a própria senha", "setor_alterado": "Setor da pessoa alterado", "sst_aberto": "PGR ou PCMSO aberto", "sst_apagado": "PGR ou PCMSO tirado da nuvem", "tarefa_alterada": "Tarefa corrigida", "tarefa_apagada": "Tarefa excluída", "tarefa_cancelada": "Tarefa cancelada", "tarefa_concluida": "Tarefa concluída", "tarefa_criada": "Tarefa criada", "tarefa_reaberta": "Tarefa reaberta", "tarefas_aberto": "Tarefas aberto", "textos_alterados": "Textos padrão alterados", "trein_cupom_apagado": "Cupom de treinamento apagado", "usuario_criado": "Acesso criado", "vencimento_anotado": "Vencimento anotado", "versao_publicada": "Versão nova publicada"};
  const LEITURAS_DO_COMPUTADOR = ["agendamento_aberto", "agendamento_relatorio", "almoxarifado_aberto", "chamados_aberto", "compromissos_aberto", "compromissos_imprimiu", "conferencia_aberta", "conferencia_exportou", "contrato_aberto", "contrato_pdf_aberto", "diario_aberto", "diario_exportou", "documento_aberto", "empresas_aberto", "fin_aberto", "fin_exportou", "fin_imprimiu", "homologacao_aberto", "orcamento_aberto", "paciente_historico", "pop_aberto", "receber_aberto", "receber_exportou", "receber_imprimiu", "relatorio_aberto", "sst_aberto", "tarefas_aberto"];
  const ACOES = {
    ...ACOES_DO_COMPUTADOR,
    homologacao_parecer: 'Parecer dado pelo celular', homologacao_atestado_aberto: 'Atestado aberto pelo celular',
    entrou: 'entrou', saiu: 'saiu', login_falhou: 'login falhou', usuario_criado: 'criou acesso', senha_redefinida: 'redefiniu senha', senha_trocada: 'trocou a própria senha',
    acesso_bloqueado: 'bloqueou acesso', acesso_liberado: 'liberou acesso', modulos_alterados: 'mudou módulos', setor_alterado: 'mudou setor', cadastro_alterado: 'alterou cadastro',
    segundo_fator_ligado: 'ligou duas etapas', segundo_fator_desligado: 'desligou duas etapas', funcao_falhou: 'função falhou',
    conferencia_aberta: 'abriu conferência', conferencia_novo: 'novo serviço', conferencia_alterou: 'alterou serviço', conferencia_importou: 'importou planilha', conferencia_pgr_liberado: 'liberou PGR', conferencia_exportou: 'exportou conferência',
    diario_aberto: 'abriu diário', diario_registrado: 'lançou no diário', diario_apagado: 'apagou do diário', diario_metas_alteradas: 'mudou metas',
    tarefa_criada: 'criou tarefa', tarefa_alterada: 'alterou tarefa', tarefa_concluida: 'concluiu tarefa', tarefa_itens: 'mexeu no checklist', tarefa_apagada: 'apagou tarefa',
    compromisso_marcado: 'marcou compromisso', compromisso_mudado: 'mudou compromisso', compromisso_cancelado: 'cancelou compromisso', compromisso_apagado: 'apagou compromisso',
    chamado_aberto: 'abriu chamado', chamado_atendido: 'atendeu chamado', chamado_resolvido: 'resolveu chamado', chamado_pendente: 'chamado pendente', chamado_devolvido: 'devolveu chamado', chamado_cancelado: 'cancelou chamado', chamado_corrigido: 'corrigiu chamado',
  };
  const LEITURAS = new Set(['entrou', 'saiu', 'login_falhou', 'homologacao_atestado_aberto', ...LEITURAS_DO_COMPUTADOR]);

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
