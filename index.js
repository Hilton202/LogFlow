import { verificarAutenticacao } from './auth.js';
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { 
    getFirestore, doc, setDoc, getDoc, addDoc, collection, 
    serverTimestamp, increment, onSnapshot, query, where, getDocs, Timestamp,
    writeBatch
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";

verificarAutenticacao();

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

let telegramConfig = {
    token: null,
    chatId: null,
    ativo: false,
    alertasEstoqueCritico: true,
    alertasEntrada: true,
    alertasSaida: true
};

let operacaoAtual = "ENTRADA";
let produtosDisponiveis = {};

// ===== CARREGAR CONFIGURAÇÕES DE TELEGRAM DO USUÁRIO =====
async function carregarConfigTelegram(uid) {
    try {
        const configRef = doc(db, "usuarios", uid, "configuracoes", "telegram");
        const configSnap = await getDoc(configRef);

        if (configSnap.exists()) {
            telegramConfig = configSnap.data();
            console.log("✅ Configurações de Telegram carregadas:", telegramConfig);
        } else {
            console.log("⚠️ Nenhuma configuração de Telegram encontrada - usando padrão");
            telegramConfig = {
                token: null,
                chatId: null,
                ativo: false,
                alertasEstoqueCritico: true,
                alertasEntrada: false,
                alertasSaida: false
            };
        }
    } catch (error) {
        console.error("❌ Erro ao carregar config:", error);
        telegramConfig = {
            token: null,
            chatId: null,
            ativo: false,
            alertasEstoqueCritico: true,
            alertasEntrada: false,
            alertasSaida: false
        };
    }
    return telegramConfig;
}

async function enviarNotificacaoTelegram(mensagem) {
    console.log("📱 Verificando config Telegram:", {
        ativo: telegramConfig.ativo,
        temToken: !!telegramConfig.token,
        temChatId: !!telegramConfig.chatId
    });

    if (!telegramConfig.ativo || !telegramConfig.token || !telegramConfig.chatId) {
        console.log("⚠️ Telegram desativado ou não configurado");
        return;
    }

    const url = `https://api.telegram.org/bot${telegramConfig.token}/sendMessage`;
    console.log("📤 Enviando notificação Telegram...", mensagem);
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: telegramConfig.chatId,
                text: mensagem
            })
        });

        const resultado = await response.json();
        
        if (resultado.ok) {
            console.log("✅ Notificação Telegram enviada com sucesso!");
        } else {
            console.error("❌ Erro Telegram:", resultado);
        }
    } catch (e) {
        console.error("❌ Erro ao enviar Telegram:", e);
    }
}

async function atualizarGiroEVerificarCritico(codigo) {
    try {
        const user = auth.currentUser;
        if (!user) return;
        
        const trintaDiasAtras = new Date();
        trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);

        // ⚡ OTIMIZAÇÃO: Fazer getDoc e getDocs em paralelo
        const produtoRef = doc(db, "usuarios", user.uid, "produtos", codigo);
        const q = query(
            collection(db, "usuarios", user.uid, "movimentacoes"),
            where("codigo", "==", codigo),
            where("tipo", "==", "SAIDA"),
            where("data", ">=", Timestamp.fromDate(trintaDiasAtras))
        );

        const [docSnap, querySnapshot] = await Promise.all([
            getDoc(produtoRef),
            getDocs(q)
        ]);

        if (!docSnap.exists()) return;

        const dados = docSnap.data();
        const estoqueAtual = dados.estoque_atual || 0;
        
        let totalSaida = 0;
        querySnapshot.forEach((doc) => { totalSaida += Number(doc.data().quantidade); });
        const novaMedia = totalSaida / 30;
        
        // ⚡ Atualizar giro
        await setDoc(produtoRef, {
            media_saida_diaria: novaMedia,
            ultima_atualizacao_giro: serverTimestamp()
        }, { merge: true });

        if (novaMedia <= 0) return;

        const coberturaDias = Math.round(estoqueAtual / novaMedia);
        
        if (coberturaDias <= 20 && telegramConfig.alertasEstoqueCritico) {
            const ultimaNotificacao = dados.ultimo_alerta_telegram ? dados.ultimo_alerta_telegram.toDate() : null;
            const agora = new Date();
            const vinteQuatroHorasEmMs = 24 * 60 * 60 * 1000;
            
            if (!ultimaNotificacao || (agora.getTime() - ultimaNotificacao.getTime()) > vinteQuatroHorasEmMs) {
                const alertaMsg = `⚠️ LOGFLOW ALERTA: O item ${codigo} está CRÍTICO!\n\n📦 Estoque: ${estoqueAtual}\n📉 Cobertura: ${coberturaDias} dias.`;
                
                Promise.all([
                    enviarNotificacaoTelegram(alertaMsg),
                    setDoc(produtoRef, { ultimo_alerta_telegram: serverTimestamp() }, { merge: true })
                ]).catch(e => console.error("Erro alerta:", e));
                
                console.log("✅ Notificação enviada e travada por 24h.");
            }
        }
    } catch (e) {
        console.error("Erro no processo de alerta:", e);
    }
}

// MONITORA PRODUTOS EM TEMPO REAL
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        console.log("❌ Usuário não autenticado");
        return;
    }

    console.log("✅ Monitorando produtos do usuário:", user.uid);
    
    // ⚡ AGUARDAR o carregamento de configurações ANTES de continuar
    await carregarConfigTelegram(user.uid);
    console.log("✅ Config Telegram carregada:", telegramConfig);
    
    onSnapshot(collection(db, "usuarios", user.uid, "produtos"), (snapshot) => {
        produtosDisponiveis = {};
        snapshot.forEach(doc => {
            const codigo = doc.id;
            const saldo = doc.data().estoque_atual || 0;
            produtosDisponiveis[codigo] = saldo;
        });
        console.log("📦 Produtos em cache:", Object.keys(produtosDisponiveis).length);
    });
});

// AUTOCOMPLETE INTELIGENTE
const inputProduto = document.getElementById('id_produto');
const alertaEstoque = document.getElementById('alertaEstoque');
const saldoAtualSpan = document.getElementById('saldoAtual');
const datalist = document.getElementById('listaProdutos');

if (inputProduto && datalist) {
    inputProduto.addEventListener('input', () => {
        const valor = inputProduto.value.toUpperCase();
        let html = "";
        
        Object.keys(produtosDisponiveis).forEach(codigo => {
            if (codigo.includes(valor)) {
                const saldo = produtosDisponiveis[codigo];
                html += `<option value="${codigo}" label="${codigo} - Saldo: ${saldo}"></option>`;
            }
        });
        
        datalist.innerHTML = html;
        console.log(`🔍 Filtrando: "${valor}" encontrou ${html.split('option').length - 2} resultados`);
        
        buscarSaldo();
    });
}

async function buscarSaldo() {
    const user = auth.currentUser;
    if (!user) {
        console.log("⏳ Aguardando autenticação...");
        return;
    }
    
    const codigo = inputProduto.value.trim().toUpperCase();
    if (!codigo) {
        alertaEstoque.style.display = 'none';
        return;
    }
    
    console.log(`🔍 Buscando: ${codigo}`);
    
    try {
        const docRef = doc(db, "usuarios", user.uid, "produtos", codigo);
        const docSnap = await getDoc(docRef);
        
        if (saldoAtualSpan && alertaEstoque) {
            if (docSnap.exists()) {
                const saldo = docSnap.data().estoque_atual || 0;
                saldoAtualSpan.innerText = saldo;
                console.log(`✅ ENCONTRADO: ${codigo} = ${saldo} unidades`);
            } else {
                saldoAtualSpan.innerText = "0 (Novo)";
                console.log(`📝 NOVO: ${codigo} será criado ao lançar`);
            }
            alertaEstoque.style.display = 'block';
        }
    } catch (error) {
        console.error("❌ ERRO ao buscar saldo:", error);
        if (saldoAtualSpan) saldoAtualSpan.innerText = "Erro";
    }
}

if (inputProduto) {
    inputProduto.addEventListener('change', buscarSaldo);
    inputProduto.addEventListener('blur', () => setTimeout(buscarSaldo, 100));
}

window.addEventListener('tipoAlterado', (e) => { operacaoAtual = e.detail; });

const form = document.getElementById('formEstoque');
if (form) {
    form.onsubmit = async (e) => {
        e.preventDefault();
        
        const user = auth.currentUser;
        if (!user) {
            alert("Você não está logado!");
            return;
        }

        const codigo = inputProduto.value.trim().toUpperCase();
        const quantidade = Number(document.getElementById('quantidade').value);
        const ref = document.getElementById('referencia')?.value.trim() || "SEM REF";

        console.log(`📤 Lançando: ${codigo} | Qtd: ${quantidade} | Tipo: ${operacaoAtual}`);

        // ✅ CONFIRMAÇÃO ANTES DE LANÇAR
        const mensagemConfirmacao = `
🔍 VERIFICAR DADOS:

📦 Produto: ${codigo}
📊 Quantidade: ${quantidade}
📝 Tipo: ${operacaoAtual === 'ENTRADA' ? '📥 ENTRADA' : '📤 SAÍDA'}
🏷️ Referência: ${ref}

⚠️ CONFIRMA ESTES DADOS?
        `;

        if (!confirm(mensagemConfirmacao)) {
            console.log("❌ Lançamento cancelado pelo usuário");
            return;
        }

        try {
            const produtoRef = doc(db, "usuarios", user.uid, "produtos", codigo);
            const movColRef = collection(db, "usuarios", user.uid, "movimentacoes");
            
            // ⚡ OTIMIZAÇÃO 1: Validar estoque ANTES de tudo
            const docSnap = await getDoc(produtoRef);
            const estoqueNoBanco = docSnap.exists() ? Number(docSnap.data().estoque_atual) : 0;

            if (operacaoAtual === "SAIDA" && quantidade > estoqueNoBanco) {
                alert(`🛑 ESTOQUE INSUFICIENTE!\nSaldo: ${estoqueNoBanco}`);
                return;
            }

            // ⚡ OTIMIZAÇÃO 2: Usar writeBatch (2 writes paralelos = 1 única operação)
            const batch = writeBatch(db);
            
            // Gravar movimento
            const novaMovRef = doc(movColRef);
            batch.set(novaMovRef, {
                codigo, quantidade, tipo: operacaoAtual, referencia: ref, data: serverTimestamp()
            });
            
            // ⚡ FIX: Usar SET com merge ao invés de UPDATE (funciona com produtos novos)
            batch.set(produtoRef, {
                codigo,
                estoque_atual: increment(operacaoAtual === 'ENTRADA' ? quantidade : -quantidade),
                ultima_atualizacao: serverTimestamp()
            }, { merge: true });
            
            // ⚡ OTIMIZAÇÃO 3: Executar batch (muito mais rápido que 2 operações sequenciais)
            await batch.commit();
            
            console.log("✅ Lançamento gravado com sucesso!");
            
            // ⚡ OTIMIZAÇÃO 4: Atualizar giro em BACKGROUND (sem await)
            if (operacaoAtual === "SAIDA") {
                atualizarGiroEVerificarCritico(codigo).catch(e => console.error("Erro giro:", e));
            }
            
            // ⚡ OTIMIZAÇÃO 5: Sucesso imediato (não espera o giro)
            form.reset();
            alertaEstoque.style.display = 'none';
            saldoAtualSpan.innerText = "";
            inputProduto.focus();
            
            // 📱 ENVIAR NOTIFICAÇÃO DE ENTRADA/SAÍDA em background
            console.log("🔔 Verificando notificações:", {
                operacao: operacaoAtual,
                alertasEntrada: telegramConfig.alertasEntrada,
                alertasSaida: telegramConfig.alertasSaida
            });

            if (operacaoAtual === "ENTRADA" && telegramConfig.alertasEntrada) {
                const msg = `📥 ENTRADA: ${codigo}\n📊 Quantidade: ${quantidade} unidades\n🏷️ Referência: ${ref}`;
                console.log("📤 Enviando notificação de ENTRADA...");
                enviarNotificacaoTelegram(msg).catch(e => console.error("Erro ao notificar entrada:", e));
            } else if (operacaoAtual === "SAIDA" && telegramConfig.alertasSaida) {
                const msg = `📤 SAÍDA: ${codigo}\n📊 Quantidade: ${quantidade} unidades\n🏷️ Referência: ${ref}`;
                console.log("📤 Enviando notificação de SAÍDA...");
                enviarNotificacaoTelegram(msg).catch(e => console.error("Erro ao notificar saída:", e));
            } else {
                console.log("⚠️ Notificação desabilitada ou config não carregada");
            }
            
            alert("✅ Lançamento realizado com sucesso!");
            
        } catch (error) { 
            console.error("❌ ERRO ao gravar:", error);
            alert("❌ Erro ao gravar: " + error.message); 
        }
    };
}