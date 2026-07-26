import { verificarAutenticacao } from './auth.js';
verificarAutenticacao();

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyBVu2nD3RJg5q-CH-oyxJvn-6agQw09rsA",
    authDomain: "sistema-de-estoque-8ff60.firebaseapp.com",
    projectId: "sistema-de-estoque-8ff60",
    storageBucket: "sistema-de-estoque-8ff60.firebasestorage.app",
    messagingSenderId: "350798221431",
    appId: "1:350798221431:web:ee97b59412b5aa0da2b672"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const auth = getAuth(app);

// ===== CRIPTOGRAFIA SIMPLES =====
// ⚠️ NÃO é militar-grade, mas previne acesso casual ao Firestore
function criptografarToken(token, uid) {
    // Derivar chave do UID (cada usuário tem sua chave única)
    const chave = uid.substring(0, 16); // Primeiros 16 chars do UID
    
    // Simples XOR + Base64 (não use em produção sensível!)
    let criptografado = '';
    for (let i = 0; i < token.length; i++) {
        criptografado += String.fromCharCode(
            token.charCodeAt(i) ^ chave.charCodeAt(i % chave.length)
        );
    }
    
    return btoa(criptografado); // Base64 encode
}

function descriptografarToken(tokenCriptografado, uid) {
    try {
        const chave = uid.substring(0, 16);
        const descriptografado = atob(tokenCriptografado); // Base64 decode
        
        let token = '';
        for (let i = 0; i < descriptografado.length; i++) {
            token += String.fromCharCode(
                descriptografado.charCodeAt(i) ^ chave.charCodeAt(i % chave.length)
            );
        }
        
        return token;
    } catch (error) {
        console.error("❌ Erro ao descriptografar token:", error);
        return null;
    }
}

// ===== TEMA ESCURO =====
window.alternarTema = () => {
    document.documentElement.style.colorScheme = document.body.classList.toggle('dark-mode') ? 'dark' : 'light';
    localStorage.setItem('tema', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
};

if (localStorage.getItem('tema') === 'dark') {
    document.body.classList.add('dark-mode');
    document.documentElement.style.colorScheme = 'dark';
}

// ===== ELEMENTOS =====
const formConfiguracao = document.getElementById('formConfiguracao');
const telegramToken = document.getElementById('telegramToken');
const telegramChatId = document.getElementById('telegramChatId');
const ativarNotificacoes = document.getElementById('ativarNotificacoes');
const mensagemDiv = document.getElementById('mensagem');

// ===== MOSTRAR MENSAGEM =====
function mostrarMensagem(texto, tipo = 'sucesso') {
    mensagemDiv.textContent = texto;
    mensagemDiv.className = `mensagem ${tipo}`;
    setTimeout(() => {
        mensagemDiv.style.display = 'none';
    }, 5000);
}

// ===== CARREGAR CONFIGURAÇÕES =====
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'login.html';
        return;
    }

    try {
        const configRef = doc(db, "usuarios", user.uid, "configuracoes", "telegram");
        const configSnap = await getDoc(configRef);

        if (configSnap.exists()) {
            const dados = configSnap.data();
            
            // ✅ Descriptografar token antes de mostrar
            const tokenDescriptografado = dados.tokenCriptografado 
                ? descriptografarToken(dados.tokenCriptografado, user.uid)
                : '';
            
            telegramToken.value = tokenDescriptografado || '';
            telegramChatId.value = dados.chatId || '';
            ativarNotificacoes.checked = dados.ativo !== false;
            document.getElementById('alertasEstoqueCritico').checked = dados.alertasEstoqueCritico !== false;
            document.getElementById('alertasEntrada').checked = dados.alertasEntrada !== false;
            document.getElementById('alertasSaida').checked = dados.alertasSaida !== false;
            
            console.log("✅ Configurações carregadas com segurança");
        } else {
            console.log("📝 Primeira vez - nenhuma configuração salva");
        }
    } catch (error) {
        console.error("❌ Erro ao carregar configurações:", error);
        mostrarMensagem("Erro ao carregar configurações: " + error.message, 'erro');
    }
});

// ===== SALVAR CONFIGURAÇÕES =====
formConfiguracao.addEventListener('submit', async (e) => {
    e.preventDefault();

    const user = auth.currentUser;
    if (!user) {
        mostrarMensagem("Você não está logado!", 'erro');
        return;
    }

    const token = telegramToken.value.trim();
    const chatId = telegramChatId.value.trim();

    if (!token || !chatId) {
        mostrarMensagem("⚠️ Preencha todos os campos!", 'erro');
        return;
    }

    // ✅ Validar token (deve ter dois pontos)
    if (!token.includes(':')) {
        mostrarMensagem("⚠️ Token inválido! Deve estar no formato: 123456:ABC-DEF...", 'erro');
        return;
    }

    // ✅ Validar Chat ID (deve ser número)
    if (!/^\d+$/.test(chatId)) {
        mostrarMensagem("⚠️ Chat ID deve ser apenas números!", 'erro');
        return;
    }

    try {
        // 🔐 CRIPTOGRAFAR token antes de salvar
        const tokenCriptografado = criptografarToken(token, user.uid);
        
        const configRef = doc(db, "usuarios", user.uid, "configuracoes", "telegram");
        
        await setDoc(configRef, {
            tokenCriptografado,  // ← Salva CRIPTOGRAFADO!
            chatId,              // ← Chat ID é público (não tem problema)
            ativo: ativarNotificacoes.checked,
            alertasEstoqueCritico: document.getElementById('alertasEstoqueCritico').checked,
            alertasEntrada: document.getElementById('alertasEntrada').checked,
            alertasSaida: document.getElementById('alertasSaida').checked,
            ultimaAtualizacao: new Date().toISOString()
        });

        mostrarMensagem("✅ Configurações salvas com segurança!", 'sucesso');
        console.log("💾 Configurações de Telegram salvas (criptografadas)!");
    } catch (error) {
        console.error("❌ Erro ao salvar:", error);
        mostrarMensagem("Erro ao salvar: " + error.message, 'erro');
    }
});

// ===== TESTAR CONEXÃO =====
window.testarConexao = async () => {
    const token = telegramToken.value.trim();
    const chatId = telegramChatId.value.trim();

    if (!token || !chatId) {
        mostrarMensagem("⚠️ Preencha Token e Chat ID primeiro!", 'erro');
        return;
    }

    try {
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: '✅ LogFlow: Teste de conexão bem-sucedido!\n\n📦 Seu Telegram está configurado corretamente!\n\nAgora você receberá notificações de entrada e saída de estoque.'
            })
        });

        const resultado = await response.json();

        if (resultado.ok) {
            mostrarMensagem("✅ Teste enviado com sucesso! Verifique seu Telegram!", 'sucesso');
            console.log("📤 Mensagem de teste enviada!");
        } else {
            if (resultado.error_code === 403) {
                mostrarMensagem(
                    "❌ Erro 403: Acesso negado!\n\n💡 SOLUÇÃO:\n1. Abra o Telegram\n2. Procure por seu bot\n3. Clique em START\n4. Volte aqui e teste novamente!",
                    'erro'
                );
            } else {
                mostrarMensagem("❌ Erro: " + (resultado.description || "Falha na conexão"), 'erro');
            }
            console.error("Erro Telegram:", resultado);
        }
    } catch (error) {
        console.error("❌ Erro na requisição:", error);
        mostrarMensagem("Erro ao testar: " + error.message, 'erro');
    }
};