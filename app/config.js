// Endereco e chave publica do Supabase — os MESMOS do SistemaCMH (o programa
// do computador) e do site. A chave "publishable/anon" e feita para ficar no
// cliente: quem protege cada linha e a RLS no banco, depois do login de
// alguem ativo. A chave que cria e bloqueia acessos (service_role) NUNCA vem
// para ca: mora dentro da Edge Function, no painel do Supabase.
window.CFG = {
  url: 'https://ojhulerxocgaxbiutrnm.supabase.co',
  key: 'sb_publishable_ymBZmTMvyknOU-BGQedvsw_71XAPfoS',

  // O login e "usuario", sem e-mail. O Supabase Auth exige um e-mail, entao
  // o usuario vira um endereco interno que nunca recebe mensagem nenhuma —
  // exatamente como o programa do computador faz (DOMINIO_LOGIN no app.py).
  dominioLogin: 'orcamentos.clinicamedicinahumana.com.br',

  // Slug que o painel do Supabase deu a Edge Function orc-usuarios: e ela
  // que cria acesso, redefine senha, bloqueia e libera, com a service_role.
  funcaoAcessos: 'swift-endpoint',

  // Baldes privados. O nome do arquivo sempre comeca pelo uid de quem sobe.
  baldeChat: 'chat',
  baldeConferencia: 'conferencia',

  app: 'CMH Sistema',
  versaoBase: '2.0',
  whatsapp: '5571993010103',
};
