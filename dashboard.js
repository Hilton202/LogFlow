import { verificarAutenticacao } from './auth.js';
verificarAutenticacao();

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getFirestore, collection, onSnapshot, query, where, orderBy, Timestamp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
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

const mesesNomes = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
let girosCalculados = {};

// --- FUNÇÃO PARA CALCULAR GIRO (ÚLTIMOS 30 DIAS) ---
function calcularGirosDinâmicos(movimentacoes) {
    const agora = new Date();
    const trintaDiasAtras = new Date();
    trintaDiasAtras.setDate(agora.getDate() - 30);
    let novosGiros = {};

    movimentacoes.forEach(doc => {
        const m = doc.data();
        const dataMov = m.data?.toDate() || new Date();
        if (m.tipo === "SAIDA" && dataMov >= trintaDiasAtras) {
            const cod = (m.codigo || "").trim();
            const qtd = Number(m.quantidade || 0);
            novosGiros[cod] = (novosGiros[cod] || 0) + qtd;
        }
    });

    Object.keys(novosGiros).forEach(cod => {
        novosGiros[cod] = novosGiros[cod] / 30;
    });
    girosCalculados = novosGiros;
    console.log("📊 Giros calculados:", girosCalculados);
}

// --- RENDERIZAR TABELA DE PRODUTOS ---
function renderizarTudo(docs) {
    console.log("🔄 Renderizando tabela com", docs.length, "produtos");
    
    let htmlTabela = "";
    let criticos = 0;
    let volumeTotal = 0;
    const corpoTabela = document.getElementById('corpoTabela');

    docs.forEach(docSnap => {
        const p = docSnap.data();
        const cod = (p.codigo || docSnap.id).trim();
        const estoque = Number(p.estoque_atual) || 0;
        const mediaGiro = girosCalculados[cod] !== undefined ? girosCalculados[cod] : (Number(p.media_saida_diaria) || 0); 
        
        volumeTotal += estoque;
        let eCritico = false;
        let textoCobertura = "Sem Saídas";

        if (mediaGiro > 0) {
            const totalDias = Math.round(estoque / mediaGiro);
            if (totalDias <= 20) {
                eCritico = true;
                criticos++;
            }
            textoCobertura = `${totalDias} dias`;
        }

        htmlTabela += `
            <tr>
                <td><strong>${cod}</strong></td>
                <td style="color: ${eCritico ? '#dc2626' : 'inherit'}; font-weight: bold;">${estoque}</td>
                <td>${mediaGiro.toFixed(2)}</td>
                <td>${textoCobertura}</td>
                <td>
                    <span style="padding: 4px 8px; border-radius: 6px; background: ${eCritico ? '#fee2e2' : '#f1f5f9'}; color: ${eCritico ? '#dc2626' : '#64748b'}; font-size: 0.7rem; font-weight:bold;">
                        ${eCritico ? '🛒 COMPRAR' : '✅ OK'}
                    </span>
                </td>
            </tr>`;
    });

    if (corpoTabela) corpoTabela.innerHTML = htmlTabela;
    document.getElementById('itensCriticos').innerText = criticos;
    document.getElementById('totalPecas').innerText = volumeTotal;
    console.log("✅ Tabela atualizada | Total:", volumeTotal, "| Críticos:", criticos);
}

// --- RENDERIZAR HISTÓRICO MENSAL ---
function renderizarHistoricoMensal(snap) {
    console.log("📅 Renderizando histórico com", snap.docs.length, "movimentações");
    
    let dadosAgrupados = {};
    let totalMovMes = 0;

    snap.forEach(doc => {
        const m = doc.data();
        const data = m.data?.toDate() || new Date();
        const mesIdx = data.getMonth();
        totalMovMes++;

        if (!dadosAgrupados[mesIdx]) dadosAgrupados[mesIdx] = { entradas: {}, saidas: {} };
        const cod = (m.codigo || "S/ COD").trim();
        const qtd = Number(m.quantidade || 0);
        const tipo = m.tipo === "ENTRADA" ? "entradas" : "saidas";
        dadosAgrupados[mesIdx][tipo][cod] = (dadosAgrupados[mesIdx][tipo][cod] || 0) + qtd;
    });

    document.getElementById('movimentacoesHoje').innerText = totalMovMes;
    
    let html = "";
    Object.keys(dadosAgrupados).sort((a,b) => b-a).forEach(mesIdx => {
        const gerarLinhas = (d, cor) => {
            const itens = Object.entries(d);
            if (itens.length === 0) return "<p style='font-size:0.7rem; color:#999;'>Nenhuma movimentação</p>";
            return itens.map(([c, q]) => `
                <div style="display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #eee; font-size:0.8rem;">
                    <span>${c}</span>
                    <span style="color: ${cor}; font-weight: bold;">${cor === '#16a34a' ? '+' : '-'}${q}</span>
                </div>`).join('');
        };

        html += `
            <div style="margin-bottom: 10px; border: 1px solid #e2e8f0; border-radius: 8px; overflow:hidden;">
                <button onclick="this.nextElementSibling.style.display = (this.nextElementSibling.style.display === 'block' ? 'none' : 'block')" 
                        style="width:100%; padding:12px; border:none; background:#f8fafc; text-align:left; font-weight:bold; cursor:pointer;">
                    📅 ${mesesNomes[mesIdx]}
                </button>
                <div style="display:none; padding:10px; background:#fff;">
                    <div style="margin-bottom:10px;">
                        <small style="color:#16a34a; font-weight:bold;">📥 ENTRADAS</small>
                        ${gerarLinhas(dadosAgrupados[mesIdx].entradas, '#16a34a')}
                    </div>
                    <div>
                        <small style="color:#dc2626; font-weight:bold;">📤 SAÍDAS</small>
                        ${gerarLinhas(dadosAgrupados[mesIdx].saidas, '#dc2626')}
                    </div>
                </div>
            </div>`;
    });
    document.getElementById('listaMovimentos').innerHTML = html;
}

// --- MONITORAMENTO EM TEMPO REAL FILTRADO POR USUÁRIO ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        const uid = user.uid;
        console.log("✅ Dashboard carregando dados para:", uid);

        // 1. Ouve as movimentações do usuário
        const movRef = collection(db, "usuarios", uid, "movimentacoes");
        const movListener = onSnapshot(movRef, (snapMov) => {
            console.log("📥 Movimentações carregadas:", snapMov.docs.length);
            calcularGirosDinâmicos(snapMov.docs);
            renderizarHistoricoMensal(snapMov);
            
            // 2. Ouve os produtos DEPOIS de calcular giros
            const prodRef = collection(db, "usuarios", uid, "produtos");
            const prodListener = onSnapshot(prodRef, (snapProd) => {
                console.log("📦 Produtos carregados:", snapProd.docs.length);
                renderizarTudo(snapProd.docs);
            });

            // Retorna função de cleanup
            return () => {
                console.log("🛑 Desinstalando listener de produtos");
                prodListener();
            };
        });

        // Retorna função de cleanup do listener de movimentações
        return () => {
            console.log("🛑 Desinstalando listener de movimentações");
            movListener();
        };
    } else {
        console.log("❌ Nenhum usuário logado. Redirecionando...");
        window.location.href = "login.html";
    }
});
