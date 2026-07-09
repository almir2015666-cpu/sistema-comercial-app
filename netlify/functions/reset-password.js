// Redefine a senha de um colaborador do setor Financeiro. Só quem já está
// logado como gestor (confirmado aqui no servidor, não só escondendo botão
// na tela) consegue trocar a senha de outra pessoa - o Admin SDK é a única
// forma de fazer isso, por isso essa função precisa existir (o navegador
// sozinho não tem esse poder).
const admin = require('firebase-admin');

const SYNTHETIC_DOMAIN = '@fin.sistemacmh.local';

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'JSON inválido.' }) };
  }

  const { idToken, usuarioAlvo, novaSenha } = body;
  if (!idToken || !usuarioAlvo || !novaSenha) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Faltam dados obrigatórios.' }) };
  }
  if (novaSenha.length < 6) {
    return { statusCode: 400, body: JSON.stringify({ error: 'A nova senha precisa ter pelo menos 6 caracteres.' }) };
  }

  const db = admin.firestore();

  // confirma quem está chamando: decodifica o token, acha o usuário (login)
  // correspondente e confere se é mesmo gestor - nunca confia em nada que
  // venha só do front-end
  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(idToken);
  } catch (e) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Sessão inválida ou expirada. Faça login novamente.' }) };
  }
  if (!decoded.email || !decoded.email.endsWith(SYNTHETIC_DOMAIN)) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Conta não pertence ao setor Financeiro.' }) };
  }
  const usuarioChamador = decoded.email.slice(0, -SYNTHETIC_DOMAIN.length);

  const chamadorSnap = await db.collection('fin_usuarios').where('usuario', '==', usuarioChamador).limit(1).get();
  if (chamadorSnap.empty || chamadorSnap.docs[0].data().role !== 'gestor') {
    return { statusCode: 403, body: JSON.stringify({ error: 'Só o gestor pode redefinir senha de colaborador.' }) };
  }

  // troca a senha de verdade na conta do colaborador alvo
  const emailAlvo = `${usuarioAlvo}${SYNTHETIC_DOMAIN}`;
  let userAlvo;
  try {
    userAlvo = await admin.auth().getUserByEmail(emailAlvo);
  } catch (e) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Colaborador não encontrado.' }) };
  }
  await admin.auth().updateUser(userAlvo.uid, { password: novaSenha });

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
