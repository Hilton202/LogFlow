import { verificarAutenticacao } from './auth.js';
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { 
    getFirestore, doc, setDoc, getDoc, addDoc, collection, 
    serverTimestamp, increment, onSnapshot, query, where, getDocs, Timestamp 
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

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

const TELEGRAM_TOKEN = "8571933477:AAGkfV-8JdctADeumjpyzHLkXAK-Sa9iNrE";
const TELEGRAM_CHAT_ID = "7048438658";

let operacaoAtual = "ENTRADA";

async function enviarNotificacaoTelegram(mensagem) {
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage?chat_id=${TELEGRAM_CHAT_ID}&text=${encodeURIComponent(mensagem)}`;
    try { await fetch(url); } catch (e) { console.error("Erro Telegram:", e); }
}

// --- ATUALIZA GIRO E VERIFICA CRÍTICO COM TRAVA DE 24H ---
async function atualizarGiroEVerificarCritico(codigo) {
    try {
        const trintaDiasAtras = new Date();
        trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);

        const q = query(
            collection(db, "movimentacoes"),
            where("codigo", "==", codigo),
            where("tipo", "==", "SAIDA"),
            where("data", ">=", Timestamp.fromDate(trintaDiasAtras))
        );

        const querySnapshot = await getDocs(q);
        let totalSaida = 0;
        querySnapshot.forEach((doc) => { totalSaida += Number(doc.data().quantidade); });

        const novaMedia = totalSaida / 30;
        const produtoRef = doc(db, "produtos", codigo);
        const docSnap = await getDoc(produtoRef);
        
        if (docSnap.exists()) {
            const dados = docSnap.data();
            const estoqueAtual = dados.estoque_atual || 0;
            
            // Pega a data da última notificação do banco
            const ultimaNotificacao = dados.ultimo_alerta_telegram ? dados.ultimo_alerta_telegram.toDate() : null;
            const agora = new Date();
            const vinteQuatroHorasEmMs = 24 * 60 * 60 * 1000;

            // 1. Atualiza a média primeiro
            await setDoc(produtoRef, {
                media_saida_diaria: novaMedia,
                ultima_atualizacao_giro: serverTimestamp()
            }, { merge: true });

            // 2. Só tenta enviar se houver giro
            if (novaMedia > 0) {
                const coberturaDias = Math.round(estoqueAtual / novaMedia);
                
                if (coberturaDias <= 20) {
                    // SÓ ENVIA SE: nunca enviou OU se passou de 24h
                    if (!ultimaNotificacao || (agora.getTime() - ultimaNotificacao.getTime()) > vinteQuatroHorasEmMs) {
                        
                        const alertaMsg = `⚠️ LOGFLOW ALERTA: O item ${codigo} está CRÍTICO!\n\n📦 Estoque: ${estoqueAtual}\n📉 Cobertura: ${coberturaDias} dias.`;
                        
                        await enviarNotificacaoTelegram(alertaMsg);

                        // GRAVA IMEDIATAMENTE A TRAVA NO BANCO
                        await setDoc(produtoRef, {
                            ultimo_alerta_telegram: serverTimestamp()
                        }, { merge: true });
                        
                        console.log("Notificação enviada e travada por 24h.");
                    }
                }
            }
        }
    } catch (e) {
        console.error("Erro no processo de alerta:", e);
    }
}

// Autocomplete e busca de saldo
const datalist = document.getElementById('listaProdutos');
if (datalist) {
    onSnapshot(collection(db, "produtos"), (snapshot) => {
        let options = "";
        snapshot.forEach(doc => { options += `<option value="${doc.id}">`; });
        datalist.innerHTML = options;
    });
}

const inputProduto = document.getElementById('id_produto');
const alertaEstoque = document.getElementById('alertaEstoque');
const saldoAtualSpan = document.getElementById('saldoAtual');

if (inputProduto) {
    inputProduto.addEventListener('change', async () => {
        const codigo = inputProduto.value.trim().toUpperCase();
        if (!codigo) return;
        const docRef = doc(db, "produtos", codigo);
        const docSnap = await getDoc(docRef);
        if (saldoAtualSpan) {
            saldoAtualSpan.innerText = docSnap.exists() ? docSnap.data().estoque_atual : "0 (Novo)";
            alertaEstoque.style.display = 'block';
        }
    });
}

window.addEventListener('tipoAlterado', (e) => { operacaoAtual = e.detail; });

const form = document.getElementById('formEstoque');
if (form) {
    form.onsubmit = async (e) => {
        e.preventDefault();
        const codigo = inputProduto.value.trim().toUpperCase();
        const quantidade = Number(document.getElementById('quantidade').value);
        const ref = document.getElementById('referencia')?.value.trim() || "SEM REF";

        try {
            const produtoRef = doc(db, "produtos", codigo);
            const docSnap = await getDoc(produtoRef);
            const estoqueNoBanco = docSnap.exists() ? Number(docSnap.data().estoque_atual) : 0;

            if (operacaoAtual === "SAIDA" && quantidade > estoqueNoBanco) {
                alert(`🛑 ESTOQUE INSUFICIENTE!\nSaldo: ${estoqueNoBanco}`);
                return;
            }

            await addDoc(collection(db, "movimentacoes"), {
                codigo, quantidade, tipo: operacaoAtual, referencia: ref, data: serverTimestamp()
            });

            await setDoc(produtoRef, {
                codigo,
                estoque_atual: increment(operacaoAtual === 'ENTRADA' ? quantidade : -quantidade),
                ultima_atualizacao: serverTimestamp()
            }, { merge: true });

            if (operacaoAtual === "SAIDA") await atualizarGiroEVerificarCritico(codigo);

            alert("✅ Lançamento realizado!");
            form.reset();
            alertaEstoque.style.display = 'none';
        } catch (error) { alert("Erro ao gravar."); }
    };
}