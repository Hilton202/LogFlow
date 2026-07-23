import { verificarAutenticacao } from './auth.js';
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { 
    getFirestore, doc, setDoc, getDoc, addDoc, collection, 
    serverTimestamp, increment, onSnapshot, query, where, getDocs, Timestamp 
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

const TELEGRAM_TOKEN = "8571933477:AAGkfV-8JdctADeumjpyzHLkXAK-Sa9iNrE";
const TELEGRAM_CHAT_ID = "7048438658";

let operacaoAtual = "ENTRADA";
let produtosDisponiveis = {}; // Armazena produtos em cache

async function enviarNotificacaoTelegram(mensagem) {
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage?chat_id=${TELEGRAM_CHAT_ID}&text=${encodeURIComponent(mensagem)}`;
    try { await fetch(url); } catch (e) { console.error("Erro Telegram:", e); }
}

async function atualizarGiroEVerificarCritico(codigo) {
    try {
        const user = auth.currentUser;
        if (!user) return;
        
        const trintaDiasAtras = new Date();
        trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);

        const q = query(
            collection(db, "usuarios", user.uid, "movimentacoes"),
            where("codigo", "==", codigo),
            where("tipo", "==", "SAIDA"),
            where("data", ">=", Timestamp.fromDate(trintaDiasAtras))
        );

        const querySnapshot = await getDocs(q);
        let totalSaida = 0;
        querySnapshot.forEach((doc) => { totalSaida += Number(doc.data().quantidade); });

        const novaMedia = totalSaida / 30;
        const produtoRef = doc(db, "usuarios", user.uid, "produtos", codigo);
        const docSnap = await getDoc(produtoRef);
        
        if (docSnap.exists()) {
            const dados = docSnap.data();
            const estoqueAtual = dados.estoque_atual || 0;
            
            const ultimaNotificacao = dados.ultimo_alerta_telegram ? dados.ultimo_alerta_telegram.toDate() : null;
            const agora = new Date();
            const vinteQuatroHorasEmMs = 24 * 60 * 60 * 1000;

            await setDoc(produtoRef, {
                media_saida_diaria: novaMedia,
                ultima_atualizacao_giro: serverTimestamp()
            }, { merge: true });

            if (novaMedia > 0) {
                const coberturaDias = Math.round(estoqueAtual / novaMedia);
                
                if (coberturaDias <= 20) {
                    if (!ultimaNotificacao || (agora.getTime() - ultimaNotificacao.getTime()) > vinteQuatroHorasEmMs) {
                        
                        const alertaMsg = `⚠️ LOGFLOW ALERTA: O item ${codigo} está CRÍTICO!\n\n📦 Estoque: ${estoqueAtual}\n📉 Cobertura: ${coberturaDias} dias.`;
                        
                        await enviarNotificacaoTelegram(alertaMsg);

                        await setDoc(produtoRef, {
                            ultimo_alerta_telegram: serverTimestamp()
                        }, { merge: true });
                        
                        console.log("✅ Notificação enviada e travada por 24h.");
                    }
                }
            }
        }
    } catch (e) {
        console.error("Erro no processo de alerta:", e);
    }
}

// --- AUTOCOMPLETE INTELIGENTE ---
onAuthStateChanged(auth, (user) => {
    if (!user) {
        console.log("❌ Usuário não autenticado");
        return;
    }

    console.log("✅ Monitorando produtos do usuário:", user.uid);
    
    // Monitora produtos em tempo real
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

// --- INPUT E SALDO ---
const inputProduto = document.getElementById('id_produto');
const alertaEstoque = document.getElementById('alertaEstoque');
const saldoAtualSpan = document.getElementById('saldoAtual');
const datalist = document.getElementById('listaProdutos');

if (inputProduto && datalist) {
    // Atualiza datalist conforme digita
    inputProduto.addEventListener('input', () => {
        const valor = inputProduto.value.toUpperCase();
        let html = "";
        
        // Filtra produtos que contêm o valor digitado
        Object.keys(produtosDisponiveis).forEach(codigo => {
            if (codigo.includes(valor)) {
                const saldo = produtosDisponiveis[codigo];
                html += `<option value="${codigo}" label="${codigo} - Saldo: ${saldo}"></option>`;
            }
        });
        
        datalist.innerHTML = html;
        console.log(`🔍 Filtrando: "${valor}" encontrou ${html.split('option').length - 2} resultados`);
        
        // Busca saldo em tempo real
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

// Busca ao selecionar do datalist
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

        try {
            const produtoRef = doc(db, "usuarios", user.uid, "produtos", codigo);
            const docSnap = await getDoc(produtoRef);
            const estoqueNoBanco = docSnap.exists() ? Number(docSnap.data().estoque_atual) : 0;

            if (operacaoAtual === "SAIDA" && quantidade > estoqueNoBanco) {
                alert(`🛑 ESTOQUE INSUFICIENTE!\nSaldo: ${estoqueNoBanco}`);
                return;
            }

            await addDoc(collection(db, "usuarios", user.uid, "movimentacoes"), {
                codigo, quantidade, tipo: operacaoAtual, referencia: ref, data: serverTimestamp()
            });

            await setDoc(produtoRef, {
                codigo,
                estoque_atual: increment(operacaoAtual === 'ENTRADA' ? quantidade : -quantidade),
                ultima_atualizacao: serverTimestamp()
            }, { merge: true });

            if (operacaoAtual === "SAIDA") await atualizarGiroEVerificarCritico(codigo);

            console.log("✅ Lançamento gravado com sucesso!");
            alert("✅ Lançamento realizado!");
            form.reset();
            alertaEstoque.style.display = 'none';
        } catch (error) { 
            console.error("❌ ERRO ao gravar:", error);
            alert("Erro ao gravar."); 
        }
    };
}
