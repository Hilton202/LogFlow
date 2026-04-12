import { verificarAutenticacao } from './auth.js';
verificarAutenticacao();

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getFirestore, collection, onSnapshot, query, where, orderBy, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

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

// ATIVA MODO OFFLINE (IMPORTANTE PARA A BIOS)
enableIndexedDbPersistence(db).catch((err) => {
    console.log("Persistência offline não ativa:", err.code);
});

const mesesNomes = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

// --- VARIÁVEL GLOBAL PARA ARMAZENAR GIRO CALCULADO ---
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
        
        // Só conta se for SAÍDA e estiver dentro dos últimos 30 dias
        if (m.tipo === "SAIDA" && dataMov >= trintaDiasAtras) {
            const cod = (m.codigo || "").trim();
            const qtd = Number(m.quantidade || 0);
            novosGiros[cod] = (novosGiros[cod] || 0) + qtd;
        }
    });

    // Divide o total de cada produto por 30 para ter a média diária
    Object.keys(novosGiros).forEach(cod => {
        novosGiros[cod] = novosGiros[cod] / 30;
    });

    girosCalculados = novosGiros;
}

// --- RENDERIZAR TABELA DE PRODUTOS ---
function renderizarTudo(docs) {
    let htmlTabela = "";
    let criticos = 0;
    let volumeTotal = 0;
    const corpoTabela = document.getElementById('corpoTabela');

    docs.forEach(docSnap => {
        const p = docSnap.data();
        const cod = (p.codigo || docSnap.id).trim();
        const estoque = Number(p.estoque_atual) || 0;
        
        // TENTA PEGAR O GIRO CALCULADO AUTOMÁTICO, SE NÃO TIVER, USA O DO CADASTRO
        const mediaGiro = girosCalculados[cod] !== undefined ? girosCalculados[cod] : (Number(p.media_saida_diaria) || 0); 
        
        volumeTotal += estoque;
        let eCritico = false;
        let textoCobertura = "Sem Saídas";

        if (mediaGiro > 0) {
            const totalDias = Math.round(estoque / mediaGiro);
            // ALERTA: Se o estoque durar 20 dias ou menos
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
}

// --- MONITORAMENTO EM TEMPO REAL ---

// 1. Ouve as movimentações primeiro para calcular os giros
onSnapshot(collection(db, "movimentacoes"), (snapMov) => {
    calcularGirosDinâmicos(snapMov.docs);
    
    // 2. Depois de calcular os giros, busca os produtos para atualizar a tabela
    onSnapshot(collection(db, "produtos"), (snapProd) => {
        renderizarTudo(snapProd.docs);
    });

    // Atualiza a lista visual de histórico (seu código original de meses)
    renderizarHistoricoMensal(snapMov);
});

function renderizarHistoricoMensal(snap) {
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
    // ... (restante da lógica de gerar HTML do histórico permanece igual)
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

// Busca e Excel (Permanecem iguais)
window.baixarExcel = function() { /* ... */ };
document.getElementById('inputBusca').addEventListener('input', (e) => { /* ... */ });