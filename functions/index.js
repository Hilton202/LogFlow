const functions = require("firebase-functions");
const admin = require("firebase-admin");
const fetch = require("node-fetch");

admin.initializeApp();

const db = admin.firestore();
const auth = admin.auth();

// ===== CONFIGURAÇÃO =====
const TELEGRAM_API = "https://api.telegram.org";
const RATE_LIMIT_MINUTES = 1;
const MAX_REQUESTS_PER_MINUTE = 60;

// ===== DESCRIPTOGRAFAR TOKEN =====
function descriptografarToken(tokenCriptografado, uid) {
  try {
    const chave = uid.substring(0, 16);
    const descriptografado = Buffer.from(tokenCriptografado, 'base64').toString();
    
    let token = '';
    for (let i = 0; i < descriptografado.length; i++) {
      token += String.fromCharCode(
        descriptografado.charCodeAt(i) ^ chave.charCodeAt(i % chave.length)
      );
    }
    
    return token;
  } catch (error) {
    console.error("❌ Erro ao descriptografar:", error);
    return null;
  }
}

// ===== RATE LIMITING =====
async function verificarRateLimit(uid) {
  const agora = Date.now();
  const umMinutoAtras = agora - (RATE_LIMIT_MINUTES * 60 * 1000);
  
  const rateLimitRef = db.collection('usuarios').doc(uid).collection('rate_limit').doc('entrada_saida');
  const snapShot = await rateLimitRef.get();
  
  if (!snapShot.exists) {
    await rateLimitRef.set({
      count: 1,
      resetTime: agora + (RATE_LIMIT_MINUTES * 60 * 1000)
    });
    return { permitido: true, tentativas: 1 };
  }
  
  const dados = snapShot.data();
  
  // Se passou do tempo de reset, reseta contador
  if (agora > dados.resetTime) {
    await rateLimitRef.set({
      count: 1,
      resetTime: agora + (RATE_LIMIT_MINUTES * 60 * 1000)
    });
    return { permitido: true, tentativas: 1 };
  }
  
  // Incrementa contador
  if (dados.count >= MAX_REQUESTS_PER_MINUTE) {
    return { 
      permitido: false, 
      tentativas: dados.count,
      proximaTentativaEm: Math.ceil((dados.resetTime - agora) / 1000)
    };
  }
  
  await rateLimitRef.update({
    count: admin.firestore.FieldValue.increment(1)
  });
  
  return { permitido: true, tentativas: dados.count + 1 };
}

// ===== REGISTRAR AUDIT LOG =====
async function registrarAuditLog(uid, acao, dados) {
  try {
    await db.collection('usuarios').doc(uid).collection('audit_logs').add({
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      acao,
      dados,
      ip: "server-side", // Em produção, pega do context
      userAgent: "Cloud Functions"
    });
    console.log(`📝 Audit Log: ${acao} por ${uid}`);
  } catch (error) {
    console.error("❌ Erro ao registrar audit log:", error);
  }
}

// ===== ENVIAR NOTIFICAÇÃO TELEGRAM =====
async function enviarTelegram(uid, mensagem) {
  try {
    const configRef = db.collection('usuarios').doc(uid).collection('configuracoes').doc('telegram');
    const configSnap = await configRef.get();
    
    if (!configSnap.exists || !configSnap.data().ativo) {
      console.log("⚠️ Telegram desativado para:", uid);
      return { sucesso: false, motivo: "Telegram desativado" };
    }
    
    const config = configSnap.data();
    
    // Descriptografar token
    const token = descriptografarToken(config.tokenCriptografado, uid);
    if (!token) {
      return { sucesso: false, motivo: "Token inválido" };
    }
    
    const url = `${TELEGRAM_API}/bot${token}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.chatId,
        text: mensagem
      })
    });
    
    const resultado = await response.json();
    
    if (resultado.ok) {
      console.log("✅ Telegram enviado com sucesso");
      return { sucesso: true };
    } else {
      console.error("❌ Erro Telegram:", resultado);
      return { sucesso: false, motivo: resultado.description };
    }
  } catch (error) {
    console.error("❌ Erro ao enviar Telegram:", error);
    return { sucesso: false, motivo: error.message };
  }
}

// ===== CLOUD FUNCTION 1: VALIDAR E LANÇAR ENTRADA/SAÍDA =====
exports.lancarMovimentacao = functions.https.onCall(async (data, context) => {
  // ✅ Verificar autenticação
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuário não autenticado');
  }
  
  const uid = context.auth.uid;
  const { codigo, quantidade, tipo, referencia } = data;
  
  try {
    // ✅ VALIDAÇÃO 1: Rate Limiting
    console.log(`🔍 Verificando rate limit para ${uid}...`);
    const rateLimitCheck = await verificarRateLimit(uid);
    
    if (!rateLimitCheck.permitido) {
      throw new functions.https.HttpsError(
        'resource_exhausted',
        `Muitas tentativas! Aguarde ${rateLimitCheck.proximaTentativaEm}s`,
        rateLimitCheck
      );
    }
    
    console.log(`✅ Rate limit OK (${rateLimitCheck.tentativas}/${MAX_REQUESTS_PER_MINUTE})`);
    
    // ✅ VALIDAÇÃO 2: Dados vazios
    if (!codigo || !quantidade || !tipo) {
      throw new functions.https.HttpsError('invalid-argument', 'Dados incompletos');
    }
    
    // ✅ VALIDAÇÃO 3: Quantidade válida
    if (typeof quantidade !== 'number' || quantidade <= 0) {
      throw new functions.https.HttpsError('invalid-argument', 'Quantidade deve ser > 0');
    }
    
    if (quantidade > 999999) {
      throw new functions.https.HttpsError('invalid-argument', 'Quantidade muito grande');
    }
    
    // ✅ VALIDAÇÃO 4: Tipo válido
    if (!['ENTRADA', 'SAIDA'].includes(tipo)) {
      throw new functions.https.HttpsError('invalid-argument', 'Tipo inválido');
    }
    
    // ✅ VALIDAÇÃO 5: Verificar produto existe (pra SAÍDA)
    if (tipo === 'SAIDA') {
      const prodRef = db.collection('usuarios').doc(uid).collection('produtos').doc(codigo);
      const prodSnap = await prodRef.get();
      
      if (!prodSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Produto não encontrado');
      }
      
      const saldo = prodSnap.data().estoque_atual || 0;
      if (saldo < quantidade) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          `Saldo insuficiente! Você tem: ${saldo}`,
          { saldoAtual: saldo }
        );
      }
    }
    
    // ✅ SALVAR MOVIMENTO (com transação)
    const movRef = db.collection('usuarios').doc(uid).collection('movimentacoes').doc();
    const prodRef = db.collection('usuarios').doc(uid).collection('produtos').doc(codigo);
    
    await db.runTransaction(async (transaction) => {
      // Gravar movimento
      transaction.set(movRef, {
        codigo,
        quantidade,
        tipo,
        referencia: referencia || 'SEM REF',
        data: admin.firestore.FieldValue.serverTimestamp()
      });
      
      // Atualizar produto
      transaction.set(
        prodRef,
        {
          codigo,
          estoque_atual: admin.firestore.FieldValue.increment(
            tipo === 'ENTRADA' ? quantidade : -quantidade
          ),
          ultima_atualizacao: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    });
    
    // ✅ REGISTRAR AUDIT LOG
    await registrarAuditLog(uid, `${tipo}_REALIZADA`, {
      codigo,
      quantidade,
      referencia
    });
    
    // ✅ ENVIAR NOTIFICAÇÃO TELEGRAM
    if (tipo === 'ENTRADA') {
      await enviarTelegram(uid, `📥 ENTRADA: ${codigo}\n📊 Quantidade: ${quantidade}\n🏷️ Ref: ${referencia || 'N/A'}`);
    } else {
      await enviarTelegram(uid, `📤 SAÍDA: ${codigo}\n📊 Quantidade: ${quantidade}\n🏷️ Ref: ${referencia || 'N/A'}`);
    }
    
    console.log(`✅ Movimento registrado com sucesso!`);
    return {
      sucesso: true,
      mensagem: 'Lançamento realizado com sucesso!',
      movimentoId: movRef.id
    };
    
  } catch (error) {
    console.error("❌ ERRO ao lançar movimento:", error);
    throw error;
  }
});

// ===== CLOUD FUNCTION 2: OBTER AUDIT LOGS =====
exports.obterAuditLogs = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuário não autenticado');
  }
  
  const uid = context.auth.uid;
  const { limite = 50, pagina = 0 } = data;
  
  try {
    const logsRef = db.collection('usuarios').doc(uid).collection('audit_logs');
    const query = logsRef
      .orderBy('timestamp', 'desc')
      .limit(limite + 1)
      .offset(pagina * limite);
    
    const snap = await query.get();
    
    const logs = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      timestamp: doc.data().timestamp?.toDate()
    }));
    
    return {
      sucesso: true,
      logs: logs.slice(0, limite),
      temMais: logs.length > limite,
      pagina,
      total: logs.length
    };
  } catch (error) {
    console.error("❌ Erro ao obter audit logs:", error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ===== CLOUD FUNCTION 3: RESETAR RATE LIMIT (admin) =====
exports.resetarRateLimit = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuário não autenticado');
  }
  
  const uid = context.auth.uid;
  
  try {
    const rateLimitRef = db.collection('usuarios').doc(uid).collection('rate_limit').doc('entrada_saida');
    await rateLimitRef.set({
      count: 0,
      resetTime: Date.now() + (RATE_LIMIT_MINUTES * 60 * 1000)
    });
    
    return { sucesso: true, mensagem: 'Rate limit resetado' };
  } catch (error) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

console.log("✅ Cloud Functions iniciadas com sucesso!");