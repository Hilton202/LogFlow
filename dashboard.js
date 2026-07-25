import { verificarAutenticacao } from './auth.js';
verificarAutenticacao();

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getFirestore, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
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

let girosCalculados = {};
let todosProdutos = [];
let produtosFiltrados = [];
let dadosMovimentacoes = [];
let paginaAtualPainel = 1;
let paginaAtualRelatorio = 1;
const PRODUTOS_POR_PAGINA = 15;

// ===== TEMA ESCURO =====
function aplicarTemaEscuro(ativo) {
    const root = document.documentElement;
    
    if (ativo) {
        // TEMA ESCURO - CORES MAIS CLARAS
        root.style.setProperty('--bg', '#0f1419');
        root.style.setProperty('--text', '#e2e8f0');
        root.style.setProperty('--border', '#1e293b');
        root.style.setProperty('--card-dark', '#1a202c');
        
        // Atualiza cores específicas dos números
        document.querySelectorAll('#totalPecas, #rel-volume').forEach(el => {
            el.style.color = '#00d4ff';
        });
        
        document.querySelectorAll('#itensCriticos, #rel-criticos').forEach(el => {
            el.style.color = '#ff6b6b';
        });
        
        document.querySelectorAll('#movimentacoesHoje, #rel-movimentacoes').forEach(el => {
            el.style.color = '#51cf66';
        });
        
        document.querySelectorAll('#rel-produtos').forEach(el => {
            el.style.color = '#ffd43b';
        });
    } else {
        // TEMA CLARO - CORES PADRÃO
        root.style.setProperty('--bg', '#f8fafc');
        root.style.setProperty('--text', '#1e293b');
        root.style.setProperty('--border', '#e2e8f0');
        root.style.setProperty('--card-dark', '#ffffff');
        
        document.querySelectorAll('#totalPecas, #rel-volume').forEach(el => {
            el.style.color = '#001F5B';
        });
        
        document.querySelectorAll('#itensCriticos, #rel-criticos').forEach(el => {
            el.style.color = '#dc2626';
        });
        
        document.querySelectorAll('#movimentacoesHoje, #rel-movimentacoes').forEach(el => {
            el.style.color = '#16a34a';
        });
        
        document.querySelectorAll('#rel-produtos').forEach(el => {
            el.style.color = '#001F5B';
        });
    }
}

window.alternarTema = () => {
    const estaEscuro = document.body.classList.toggle('dark-mode');
    document.documentElement.style.colorScheme = estaEscuro ? 'dark' : 'light';
    localStorage.setItem('tema', estaEscuro ? 'dark' : 'light');
    aplicarTemaEscuro(estaEscuro);
};

if (localStorage.getItem('tema') === 'dark') {
    document.body.classList.add('dark-mode');
    document.documentElement.style.colorScheme = 'dark';
    aplicarTemaEscuro(true);
} else {
    aplicarTemaEscuro(false);
}

// ===== ABAS =====
window.mudarAba = (aba) => {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(aba).classList.add('active');
    event.target.classList.add('active');
};

// ===== CÁLCULO DE GIROS =====
function calcularGiros(movimentacoes) {
    const agora = new Date();
    const trintaDiasAtras = new Date();
    trintaDiasAtras.setDate(agora.getDate() - 30);
    let novosGiros = {};
    dadosMovimentacoes = [];

    movimentacoes.forEach(doc => {
        const m = doc.data();
        const dataMov = m.data?.toDate() || new Date();
        dadosMovimentacoes.push({...m, data: dataMov});

        if (m.tipo === "SAIDA" && dataMov >= trintaDiasAtras) {
            const cod = (m.codigo || "").trim();
            novosGiros[cod] = (novosGiros[cod] || 0) + Number(m.quantidade || 0);
        }
    });

    Object.keys(novosGiros).forEach(cod => {
        novosGiros[cod] = novosGiros[cod] / 30;
    });
    girosCalculados = novosGiros;
    console.log("📊 Giros calculados:", Object.keys(girosCalculados).length);
}

// ===== RENDERIZAR PAINEL =====
function renderizarTudo(docs) {
    todosProdutos = docs;
    produtosFiltrados = docs;

    let criticos = 0;
    let volumeTotal = 0;

    docs.forEach(docSnap => {
        const p = docSnap.data();
        const estoque = Number(p.estoque_atual) || 0;
        volumeTotal += estoque;
        
        const mediaGiro = girosCalculados[p.codigo] || 0;
        if (mediaGiro > 0) {
            const totalDias = Math.round(estoque / mediaGiro);
            if (totalDias <= 20) criticos++;
        }
    });

    document.getElementById('totalPecas').innerText = volumeTotal;
    document.getElementById('itensCriticos').innerText = criticos;
    document.getElementById('rel-volume').innerText = volumeTotal;
    document.getElementById('rel-produtos').innerText = docs.length;
    document.getElementById('rel-criticos').innerText = criticos;
    document.getElementById('dataRelatorio').innerText = new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    paginaAtualPainel = 1;
    paginaAtualRelatorio = 1;
    renderizarPaginaPainel();
    renderizarPaginaRelatorio();
    renderizarGraficos(docs);
}

// ===== BUSCA (Painel) =====
document.getElementById('inputBusca').addEventListener('input', (e) => {
    const termo = e.target.value.toUpperCase();
    produtosFiltrados = termo ? todosProdutos.filter(doc => 
        (doc.data().codigo || doc.id).toUpperCase().includes(termo)
    ) : todosProdutos;
    paginaAtualPainel = 1;
    renderizarPaginaPainel();
});

// ===== PAGINAÇÃO PAINEL =====
function renderizarPaginaPainel() {
    const inicio = (paginaAtualPainel - 1) * PRODUTOS_POR_PAGINA;
    const fim = inicio + PRODUTOS_POR_PAGINA;
    const produtosPagina = produtosFiltrados.slice(inicio, fim);
    
    let html = "";
    produtosPagina.forEach(docSnap => {
        const p = docSnap.data();
        const cod = (p.codigo || docSnap.id).trim();
        const estoque = Number(p.estoque_atual) || 0;
        const mediaGiro = girosCalculados[cod] || 0;
        
        let eCritico = false;
        let textoCobertura = "Sem Saídas";

        if (mediaGiro > 0) {
            const totalDias = Math.round(estoque / mediaGiro);
            if (totalDias <= 20) eCritico = true;
            textoCobertura = `${totalDias} dias`;
        }

        html += `<tr>
            <td><strong>${cod}</strong></td>
            <td style="color: ${eCritico ? '#dc2626' : 'inherit'}; font-weight: bold;">${estoque}</td>
            <td>${mediaGiro.toFixed(2)}</td>
            <td>${textoCobertura}</td>
            <td><span style="padding: 4px 8px; border-radius: 5px; background: ${eCritico ? '#fee2e2' : '#f1f5f9'}; color: ${eCritico ? '#dc2626' : '#64748b'}; font-size: 0.75rem; font-weight: bold;">
                ${eCritico ? '🛒 COMPRAR' : '✅ OK'}
            </span></td>
        </tr>`;
    });

    document.getElementById('corpoTabela').innerHTML = html || '<tr><td colspan="5" class="loading">Nenhum produto encontrado</td></tr>';
    renderizarPaginacaoPainel();
}

window.mudarPaginaPainel = (novaPagina) => {
    paginaAtualPainel = novaPagina;
    renderizarPaginaPainel();
    window.scrollTo(0, 0);
};

function renderizarPaginacaoPainel() {
    const totalPaginas = Math.ceil(produtosFiltrados.length / PRODUTOS_POR_PAGINA);
    let paginacaoDiv = document.getElementById('paginacao');
    
    if (!paginacaoDiv) {
        paginacaoDiv = document.createElement('div');
        paginacaoDiv.id = 'paginacao';
        document.getElementById('painel').appendChild(paginacaoDiv);
    }
    
    if (totalPaginas <= 1) {
        paginacaoDiv.innerHTML = "";
        return;
    }

    let html = `<div style="width: 100%; display: flex; gap: 10px; justify-content: center; align-items: center; margin-top: 20px; flex-wrap: wrap; padding: 20px 0;">`;
    
    if (paginaAtualPainel > 1) {
        html += `<button class="btn btn-primary" onclick="window.mudarPaginaPainel(${paginaAtualPainel - 1})">← Anterior</button>`;
    }

    for (let i = 1; i <= totalPaginas; i++) {
        if (i === paginaAtualPainel) {
            html += `<button class="btn" style="background: var(--success); color: white; min-width: 40px;">${i}</button>`;
        } else if (i <= 3 || i > totalPaginas - 2) {
            html += `<button class="btn" style="background: #e0e7ff; color: var(--primary); min-width: 40px;" onclick="window.mudarPaginaPainel(${i})">${i}</button>`;
        }
    }

    if (paginaAtualPainel < totalPaginas) {
        html += `<button class="btn btn-primary" onclick="window.mudarPaginaPainel(${paginaAtualPainel + 1})">Próximo →</button>`;
    }

    html += `<span style="font-size: 0.9rem; color: #999;">Página ${paginaAtualPainel} de ${totalPaginas}</span></div>`;
    paginacaoDiv.innerHTML = html;
}

// ===== PAGINAÇÃO RELATÓRIO =====
function renderizarPaginaRelatorio() {
    const inicio = (paginaAtualRelatorio - 1) * PRODUTOS_POR_PAGINA;
    const fim = inicio + PRODUTOS_POR_PAGINA;
    const produtosPagina = todosProdutos.slice(inicio, fim);
    
    let html = "";
    produtosPagina.forEach(docSnap => {
        const p = docSnap.data();
        const cod = (p.codigo || docSnap.id).trim();
        const estoque = Number(p.estoque_atual) || 0;
        const mediaGiro = girosCalculados[cod] || 0;
        
        let eCritico = false;
        let textoCobertura = "Sem Saídas";

        if (mediaGiro > 0) {
            const totalDias = Math.round(estoque / mediaGiro);
            if (totalDias <= 20) eCritico = true;
            textoCobertura = `${totalDias} dias`;
        }

        html += `<tr>
            <td><strong>${cod}</strong></td>
            <td style="color: ${eCritico ? '#dc2626' : 'inherit'}; font-weight: bold;">${estoque}</td>
            <td>${mediaGiro.toFixed(2)}</td>
            <td>${textoCobertura}</td>
            <td><span style="padding: 4px 8px; border-radius: 5px; background: ${eCritico ? '#fee2e2' : '#f1f5f9'}; color: ${eCritico ? '#dc2626' : '#64748b'}; font-size: 0.75rem; font-weight: bold;">
                ${eCritico ? '🛒 COMPRAR' : '✅ OK'}
            </span></td>
        </tr>`;
    });

    document.getElementById('relatorioTabela').innerHTML = html || '<tr><td colspan="5" class="loading">Nenhum produto encontrado</td></tr>';
    renderizarPaginacaoRelatorio();
}

window.mudarPaginaRelatorio = (novaPagina) => {
    paginaAtualRelatorio = novaPagina;
    renderizarPaginaRelatorio();
    window.scrollTo(0, 0);
};

function renderizarPaginacaoRelatorio() {
    const totalPaginas = Math.ceil(todosProdutos.length / PRODUTOS_POR_PAGINA);
    let paginacaoDiv = document.getElementById('paginacaoRelatorio');
    
    if (!paginacaoDiv) {
        paginacaoDiv = document.createElement('div');
        paginacaoDiv.id = 'paginacaoRelatorio';
        document.getElementById('relatorio').appendChild(paginacaoDiv);
    }
    
    if (totalPaginas <= 1) {
        paginacaoDiv.innerHTML = "";
        return;
    }

    let html = `<div style="width: 100%; display: flex; gap: 10px; justify-content: center; align-items: center; margin-top: 20px; flex-wrap: wrap; padding: 20px 0;">`;
    
    if (paginaAtualRelatorio > 1) {
        html += `<button class="btn btn-primary" onclick="window.mudarPaginaRelatorio(${paginaAtualRelatorio - 1})">← Anterior</button>`;
    }

    for (let i = 1; i <= totalPaginas; i++) {
        if (i === paginaAtualRelatorio) {
            html += `<button class="btn" style="background: var(--success); color: white; min-width: 40px;">${i}</button>`;
        } else if (i <= 3 || i > totalPaginas - 2) {
            html += `<button class="btn" style="background: #e0e7ff; color: var(--primary); min-width: 40px;" onclick="window.mudarPaginaRelatorio(${i})">${i}</button>`;
        }
    }

    if (paginaAtualRelatorio < totalPaginas) {
        html += `<button class="btn btn-primary" onclick="window.mudarPaginaRelatorio(${paginaAtualRelatorio + 1})">Próximo →</button>`;
    }

    html += `<span style="font-size: 0.9rem; color: #999;">Página ${paginaAtualRelatorio} de ${totalPaginas}</span></div>`;
    paginacaoDiv.innerHTML = html;
}

// ===== GRÁFICOS =====
function renderizarGraficos(docs) {
    const ctx1 = document.getElementById('chartEntradaSaida')?.getContext('2d');
    const ctx2 = document.getElementById('chartMaisMovimentados')?.getContext('2d');
    const ctx3 = document.getElementById('chartEvolucaoEstoque')?.getContext('2d');
    const ctx4 = document.getElementById('chartStatusProdutos')?.getContext('2d');

    // Dados por dia
    let dadosPorDia = {};
    dadosMovimentacoes.forEach(m => {
        const dia = m.data.toLocaleDateString('pt-BR');
        if (!dadosPorDia[dia]) dadosPorDia[dia] = { entrada: 0, saida: 0 };
        if (m.tipo === 'ENTRADA') dadosPorDia[dia].entrada += m.quantidade || 0;
        else dadosPorDia[dia].saida += m.quantidade || 0;
    });

    const dias = Object.keys(dadosPorDia).sort();
    const entradas = dias.map(d => dadosPorDia[d].entrada);
    const saidas = dias.map(d => dadosPorDia[d].saida);

    if (ctx1) {
        new Chart(ctx1, {
            type: 'line',
            data: {
                labels: dias,
                datasets: [
                    {
                        label: 'Entradas',
                        data: entradas,
                        borderColor: '#16a34a',
                        backgroundColor: 'rgba(22, 163, 74, 0.1)',
                        tension: 0.4
                    },
                    {
                        label: 'Saídas',
                        data: saidas,
                        borderColor: '#dc2626',
                        backgroundColor: 'rgba(220, 38, 38, 0.1)',
                        tension: 0.4
                    }
                ]
            },
            options: { 
                responsive: true, 
                plugins: { legend: { position: 'top' } },
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }

    // Produtos mais movimentados
    let movPorProduto = {};
    dadosMovimentacoes.forEach(m => {
        const cod = m.codigo || 'SEM COD';
        movPorProduto[cod] = (movPorProduto[cod] || 0) + (m.quantidade || 0);
    });

    const top5 = Object.entries(movPorProduto).sort((a, b) => b[1] - a[1]).slice(0, 5);

    if (ctx2) {
        new Chart(ctx2, {
            type: 'doughnut',
            data: {
                labels: top5.map(p => p[0]),
                datasets: [{
                    data: top5.map(p => p[1]),
                    backgroundColor: ['#001F5B', '#16a34a', '#dc2626', '#f59e0b', '#06b6d4']
                }]
            },
            options: { responsive: true }
        });
    }

    // Evolução estoque
    const somaEstoque = docs.reduce((sum, doc) => sum + (Number(doc.data().estoque_atual) || 0), 0);

    if (ctx3) {
        new Chart(ctx3, {
            type: 'line',
            data: {
                labels: dias.length > 0 ? dias : ['Sem dados'],
                datasets: [{
                    label: 'Estoque Total',
                    data: dias.length > 0 ? dias.map(() => somaEstoque) : [somaEstoque],
                    borderColor: '#001F5B',
                    backgroundColor: 'rgba(0, 31, 91, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: { 
                responsive: true, 
                plugins: { legend: { position: 'top' } },
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }

    // Status
    let ok = 0, criticos = 0;
    docs.forEach(doc => {
        const mediaGiro = girosCalculados[doc.data().codigo] || 0;
        if (mediaGiro > 0) {
            const totalDias = Math.round(Number(doc.data().estoque_atual || 0) / mediaGiro);
            if (totalDias <= 20) criticos++;
            else ok++;
        } else ok++;
    });

    if (ctx4) {
        new Chart(ctx4, {
            type: 'pie',
            data: {
                labels: ['✅ OK', '🛒 Crítico'],
                datasets: [{
                    data: [ok, criticos],
                    backgroundColor: ['#16a34a', '#dc2626']
                }]
            },
            options: { responsive: true }
        });
    }
}

// ===== BACKUP =====
window.fazerBackup = async () => {
    const user = auth.currentUser;
    if (!user) {
        alert("Você não está logado!");
        return;
    }

    try {
        alert("⏳ Preparando backup...");
        
        const produtos = [];
        const movimentacoes = [];

        const prodsSnap = await new Promise((resolve) => {
            onSnapshot(collection(db, "usuarios", user.uid, "produtos"), resolve, { once: true });
        });

        const movsSnap = await new Promise((resolve) => {
            onSnapshot(collection(db, "usuarios", user.uid, "movimentacoes"), resolve, { once: true });
        });

        prodsSnap.forEach(doc => produtos.push({ id: doc.id, ...doc.data() }));
        movsSnap.forEach(doc => movimentacoes.push({ id: doc.id, ...doc.data() }));

        const backup = {
            data: new Date().toISOString(),
            produtos,
            movimentacoes,
            total_produtos: produtos.length,
            total_movimentacoes: movimentacoes.length
        };

        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `backup_logflow_${new Date().toISOString().split('T')[0]}.json`;
        link.click();

        alert("✅ Backup realizado com sucesso!");
    } catch (error) {
        console.error("Erro no backup:", error);
        alert("❌ Erro ao fazer backup");
    }
};

// ===== PDF =====
window.gerarPDF = async () => {
    const element = document.getElementById('relatorio');
    const opt = {
        margin: 10,
        filename: `relatorio_logflow_${new Date().toISOString().split('T')[0]}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' }
    };

    try {
        await html2pdf().set(opt).from(element).save();
        alert("✅ PDF gerado com sucesso!");
    } catch (error) {
        console.error("Erro ao gerar PDF:", error);
        alert("❌ Erro ao gerar PDF");
    }
};

// ===== MONITOR =====
onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log("✅ Dashboard avançado - UID:", user.uid);
        
        onSnapshot(collection(db, "usuarios", user.uid, "movimentacoes"), (snap) => {
            console.log("📥 Movimentações:", snap.docs.length);
            calcularGiros(snap.docs);
        });

        onSnapshot(collection(db, "usuarios", user.uid, "produtos"), (snap) => {
            console.log("📦 Produtos:", snap.docs.length);
            renderizarTudo(snap.docs);
        });
    } else {
        console.log("❌ Usuário não logado!");
        window.location.href = "login.html";
    }
});