/* =====================================================================
   CMH Sistema — a nuvem (Supabase).

   O mesmo banco, as mesmas tabelas e as mesmas regras do programa do
   computador. O que o servidor decide, o servidor decide: aqui so se
   pede, se traduz o erro e se registra no log.

   Tres armadilhas herdadas do PostgREST, todas tratadas aqui:
     1. Teto de 1.000 linhas por resposta, em silencio -> N.tudo() pagina.
     2. UPDATE/DELETE recusado pela RLS responde 200/204 com corpo vazio ->
        sempre .select() e tratar [] como "nao deixou".
     3. O administrador so e administrador com o segundo fator na sessao
        (aal2). Sem ele, le e grava como usuario comum, sem erro.
   ===================================================================== */
window.N = (() => {
  'use strict';

  const sb = supabase.createClient(CFG.url, CFG.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });

  const estado = {
    id: null,        // auth.uid()
    eu: null,        // a minha linha de orc_usuarios
    fatorPendente: null,
    aparelho: null,  // {maquina}
    relidoEm: 0,
  };

  const PAGINA = 1000;
  const SEM_INTERNET = 'Sem internet agora. Tente de novo em instantes.';

  /* ------------------------------------------------------- erros */
  function recado(erro, padrao = 'Não deu certo.') {
    if (!erro) return padrao;
    const m = String(erro.message || erro.error_description || erro.details || '');
    if (/Failed to fetch|NetworkError|Load failed|network/i.test(m)) return SEM_INTERNET;
    if (erro.code === 'PGRST301' || erro.status === 401) return 'Sua sessão venceu. Entre de novo.';
    if (erro.status === 403 || /permission denied|violates row-level/i.test(m)) return 'Você não tem permissão para isso.';
    if (erro.code === '23514' || /check constraint|check_violation/i.test(m)) return m.replace(/^.*?:\s*/, '') || padrao;
    if (/relation .* does not exist/i.test(m)) return 'Esta tabela ainda não existe no servidor. Fale com o T.I.';
    return m || padrao;
  }

  // O supabase-js embrulha erro de Edge Function; a frase util esta no corpo.
  async function lerErroFuncao(error) {
    try {
      if (error?.context?.json) return (await error.context.json())?.error || '';
      if (error?.context?.text) return JSON.parse(await error.context.text())?.error || '';
    } catch { /* sem corpo legivel */ }
    return error?.message || '';
  }

  /* --------------------------------------------------- aparelho */
  async function aparelho() {
    if (estado.aparelho) return estado.aparelho;
    let maquina = 'celular';
    try {
      const D = window.Capacitor?.Plugins?.Device;
      if (D) {
        const i = await D.getInfo();
        maquina = [i.name, i.model].filter(Boolean).join(' · ') || i.platform || 'celular';
      } else {
        maquina = /iPhone|iPad/.test(navigator.userAgent) ? 'iPhone (navegador)' : 'navegador';
      }
    } catch { /* fica "celular" */ }
    estado.aparelho = { maquina: String(maquina).slice(0, 60) };
    return estado.aparelho;
  }

  // O que vai em toda linha de log. Sem IP nem localizacao de proposito:
  // no celular isso mudaria a cada torre e nao diz nada util.
  async function onde() {
    const a = await aparelho();
    return { maquina: a.maquina, app_versao: `app ${CFG.versao || CFG.versaoBase}`, usuario_windows: 'app', ip_local: '', ip_publico: '', localizacao: '' };
  }

  /* --------------------------------------------------------- log */
  async function registrar(acao, detalhe = null) {
    try {
      if (!estado.id) return;
      await sb.from('orc_log').insert({
        ...(await onde()),
        usuario_id: estado.id, usuario_login: estado.eu?.usuario || null, usuario_nome: estado.eu?.nome || null,
        acao, detalhe: detalhe ? String(detalhe).slice(0, 2000) : null,
      });
    } catch { /* log nunca derruba a operacao */ }
  }

  /* ------------------------------------------------------- login */
  const CAMPOS_CADASTRO = 'usuario,nome,cargo,profissao,registro,setor,admin,ativo,trocar_senha,ultimo_acesso,modulos';

  // Sempre pela minha linha (id=eq.<uid>): o admin enxerga a tabela toda e
  // pegar "a primeira" faria o app falar em nome de outra pessoa.
  async function cadastro() {
    const { data, error } = await sb.from('orc_usuarios').select(CAMPOS_CADASTRO).eq('id', estado.id).limit(1);
    if (error) throw error;
    return data && data[0] ? data[0] : null;
  }

  async function avisarFalha(usuario, motivo) {
    try {
      await sb.functions.invoke(CFG.funcaoAcessos, { body: { acao: 'falha', usuario: L.loginDe(usuario), motivo, ...(await onde()) } });
    } catch { /* silencioso */ }
  }

  // Devolve: {ok:true} | {fator:'<id>'} (precisa do codigo) | lanca Error.
  async function entrar(usuario, senha) {
    const email = L.emailDe(usuario, CFG.dominioLogin);
    const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
    if (error) {
      let motivo = 'Usuário ou senha incorretos.';
      if (/Failed to fetch|network/i.test(error.message)) throw new Error(SEM_INTERNET);
      if (error.code === 'user_banned') motivo = 'Este acesso está bloqueado. Fale com o administrador.';
      else if (error.code === 'over_request_rate_limit' || error.status === 429) motivo = 'Muitas tentativas seguidas. Espere um minuto e tente de novo.';
      avisarFalha(usuario, motivo);
      throw new Error(motivo);
    }
    estado.id = data.user.id;
    const aal = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal.data && aal.data.nextLevel === 'aal2' && aal.data.currentLevel !== 'aal2') {
      const fatores = await sb.auth.mfa.listFactors();
      const totp = (fatores.data?.totp || []).find((f) => f.status === 'verified');
      if (totp) { estado.fatorPendente = totp.id; return { fator: totp.id }; }
    }
    return depoisDoLogin();
  }

  async function completarSegundoFator(codigo) {
    const factorId = estado.fatorPendente;
    const ch = await sb.auth.mfa.challenge({ factorId });
    if (ch.error) throw new Error(recado(ch.error, 'Não deu para pedir o código.'));
    const v = await sb.auth.mfa.verify({ factorId, challengeId: ch.data.id, code: String(codigo).trim() });
    if (v.error) throw new Error(/invalid|Invalid/i.test(v.error.message) ? 'Código inválido. Confira o relógio do aparelho e tente de novo.' : recado(v.error));
    estado.fatorPendente = null;
    return depoisDoLogin();
  }

  async function depoisDoLogin() {
    const eu = await cadastro();
    if (!eu) { await sb.auth.signOut(); estado.id = null; throw new Error('Seu login existe, mas não está liberado para o sistema.'); }
    if (eu.ativo === false) { await sb.auth.signOut(); estado.id = null; throw new Error('Este acesso está bloqueado. Fale com o administrador.'); }
    estado.eu = { id: estado.id, ...eu };
    estado.relidoEm = Date.now();
    sb.rpc('orc_marcar_acesso').then(() => {}, () => {});
    registrar('entrou');
    return { ok: true, trocarSenha: !!eu.trocar_senha };
  }

  // Ao abrir o app: ha sessao guardada? Entao o cadastro e relido.
  async function restaurar() {
    const { data } = await sb.auth.getSession();
    if (!data?.session) return null;
    estado.id = data.session.user.id;
    const aal = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal.data && aal.data.nextLevel === 'aal2' && aal.data.currentLevel !== 'aal2') {
      // A sessao voltou sem o segundo fator: pede o codigo de novo.
      const fatores = await sb.auth.mfa.listFactors();
      const totp = (fatores.data?.totp || []).find((f) => f.status === 'verified');
      if (totp) { estado.fatorPendente = totp.id; return { fator: totp.id }; }
    }
    try {
      const eu = await cadastro();
      if (!eu || eu.ativo === false) { await sair(false); return null; }
      estado.eu = { id: estado.id, ...eu };
      estado.relidoEm = Date.now();
      sb.rpc('orc_marcar_acesso').then(() => {}, () => {});
      return { ok: true, trocarSenha: !!eu.trocar_senha };
    } catch (e) {
      if (/Failed to fetch|network/i.test(String(e.message))) return { offline: true };
      throw e;
    }
  }

  // Reler o cadastro de vez em quando: permissao tirada no computador vale
  // no celular em ate um minuto.
  async function recarregarUsuario(forcar = false) {
    if (!estado.id) return null;
    if (!forcar && Date.now() - estado.relidoEm < 60000) return estado.eu;
    try {
      const eu = await cadastro();
      if (!eu || eu.ativo === false) { await sair(false); return null; }
      estado.eu = { id: estado.id, ...eu };
      estado.relidoEm = Date.now();
    } catch { /* fica com o que tinha */ }
    return estado.eu;
  }

  async function trocarSenha(nova) {
    const { error } = await sb.auth.updateUser({ password: nova });
    if (error) throw new Error(/weak|short|least/i.test(error.message) ? 'Senha fraca: use pelo menos 8 caracteres, com letras e números.' : recado(error));
    await sb.rpc('orc_senha_trocada');
    if (estado.eu) estado.eu.trocar_senha = false;
    registrar('senha_trocada');
  }

  async function sair(anotar = true) {
    if (anotar) await registrar('saiu');
    try { await sb.auth.signOut(); } catch { /* sem sessao */ }
    estado.id = null; estado.eu = null; estado.fatorPendente = null;
  }

  /* ------------------------------------------------------ 2 etapas */
  async function fatores() {
    const r = await sb.auth.mfa.listFactors();
    if (r.error) throw new Error(recado(r.error));
    return (r.data?.totp || []).filter((f) => f.status === 'verified');
  }
  async function ligarSegundoFator() {
    const r = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'CMH Sistema' });
    if (r.error) throw new Error(recado(r.error));
    return { id: r.data.id, segredo: r.data.totp.secret, uri: r.data.totp.uri };
  }
  async function confirmarSegundoFator(factorId, codigo) {
    const ch = await sb.auth.mfa.challenge({ factorId });
    if (ch.error) throw new Error(recado(ch.error));
    const v = await sb.auth.mfa.verify({ factorId, challengeId: ch.data.id, code: String(codigo).trim() });
    if (v.error) throw new Error('Código inválido. Tente de novo.');
    registrar('segundo_fator_ligado');
  }
  async function desligarSegundoFator(factorId) {
    const r = await sb.auth.mfa.unenroll({ factorId });
    if (r.error) throw new Error(recado(r.error));
    registrar('segundo_fator_desligado');
  }
  async function nivelDaSessao() {
    const r = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    return r.data?.currentLevel || 'aal1';
  }

  /* ---------------------------------------------------- consultas */
  // Pagina ate vir pagina menor que 1000. `montar(de, ate)` devolve a query
  // ja com .range(de, ate). O PostgREST corta em 1000 sem avisar.
  async function tudo(montar, teto = 20000) {
    const linhas = [];
    for (let de = 0; de < teto; de += PAGINA) {
      const { data, error } = await montar(de, de + PAGINA - 1);
      if (error) throw error;
      linhas.push(...(data || []));
      if (!data || data.length < PAGINA) break;
    }
    return linhas;
  }

  // PATCH que exige a linha de volta: [] e recusa da RLS, nao sucesso.
  async function mudar(tabela, filtros, corpo) {
    let q = sb.from(tabela).update(corpo);
    for (const [k, v] of Object.entries(filtros)) q = q.eq(k, v);
    const { data, error } = await q.select();
    if (error) throw error;
    if (!data || !data.length) throw new Error('O servidor não deixou: ou o registro não é seu, ou ele mudou de situação.');
    return data[0];
  }

  async function apagar(tabela, filtros) {
    let q = sb.from(tabela).delete();
    for (const [k, v] of Object.entries(filtros)) q = q.eq(k, v);
    const { data, error } = await q.select();
    if (error) throw error;
    return (data || []).length;
  }

  async function funcao(corpo) {
    const { data, error } = await sb.functions.invoke(CFG.funcaoAcessos, { body: { ...corpo, ...(await onde()) } });
    if (error) throw new Error((await lerErroFuncao(error)) || 'A função do servidor não respondeu.');
    if (data && data.error) throw new Error(data.error);
    return data;
  }

  /* ------------------------------------------------------ arquivos */
  async function subir(balde, caminho, arquivo) {
    const { error } = await sb.storage.from(balde).upload(caminho, arquivo, { upsert: false, contentType: arquivo.type || 'application/octet-stream' });
    if (error) throw new Error(recado(error, 'O arquivo não subiu.'));
    return caminho;
  }
  async function urlAssinada(balde, caminho, segundos = 600) {
    const { data, error } = await sb.storage.from(balde).createSignedUrl(caminho, segundos);
    if (error) throw new Error(recado(error, 'Não deu para abrir o arquivo.'));
    return data.signedUrl;
  }

  const hex12 = () => {
    const a = new Uint8Array(6); crypto.getRandomValues(a);
    return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
  };

  return { sb, estado, PAGINA, recado, lerErroFuncao, onde, aparelho, registrar,
    entrar, completarSegundoFator, restaurar, recarregarUsuario, trocarSenha, sair,
    fatores, ligarSegundoFator, confirmarSegundoFator, desligarSegundoFator, nivelDaSessao,
    tudo, mudar, apagar, funcao, subir, urlAssinada, hex12 };
})();
