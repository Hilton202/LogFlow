import { verificarAutenticacao } from './auth.js';
verificarAutenticacao();

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { 
    getFirestore, doc, setDoc, getDoc, addDoc, collection, 
    serverTimestamp, increment, onSnapshot, query, where, getDocs, Timestamp,
    writeBatch
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
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

// ===== TEMA ESCURO =====
window.alternarTema = () => {
    document.documentElement.style.colorScheme = document.body.classList.toggle('dark-mode') ? 'dark' : 'light';
    localStorage.setItem('tema', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
};

if (localStorage.getItem('tema') === 'dark') {
    document.body.classList.add('dark-mode');
    document.documentElement.style.colorScheme = 'dark';
}

// ===== CARREGAR DASHBOARD =====
async function carregarDashboard() {
    const user = auth.currentUser;
    if (!user) return;

    try {
        console.log("📊 Carregando dashboard...");
        
        const prodRef = collection(db, "usuarios", user.uid, "produtos");
        const prodSnap = await getDocs(prodRef);
        
        let totalProdutos = 0;
        let totalEstoque = 0;
        let produtosCriticos = 0;
        let totalMovimentacoes = 0;

        const produtosArray = [];

        prodSnap.forEach(doc => {
            totalProdutos++;
            const dados = doc.data();
            const saldo = dados.estoque_atual || 0;
            totalEstoque += saldo;
            
            if (saldo <= 20) produtosCriticos++;
            
            produtosArray.push({
                codigo: doc.id,
                saldo,
                giro: dados.media_saida_diaria || 0,
                cobertura: dados.cobertura_dias || 0
            });
        });

        // ===== CONTAR MOVIMENTACOES =====
        const movRef = collection(db, "usuarios", user.uid, "movimentacoes");
        const movSnap = await getDocs(movRef);
        totalMovimentacoes = movSnap.size;

        // ===== ATUALIZAR NÚMEROS NO DASHBOARD =====
        const elemVolume = document.getElementById('volumeTotal');
        const elemCriticos = document.getElementById('itensCriticos');
        const elemCadastrados = document.getElementById('produtosCadastrados');
        const elemMovimentacoes = document.getElementById('movimentacoes');

        if (elemVolume) elemVolume.innerText = totalEstoque;
        if (elemCriticos) elemCriticos.innerText = produtosCriticos;
        if (elemCadastrados) elemCadastrados.innerText = totalProdutos;
        if (elemMovimentacoes) elemMovimentacoes.innerText = totalMovimentacoes;

        console.log(`✅ Dashboard atualizado | Produtos: ${totalProdutos} | Total: ${totalEstoque}`);

        // ===== CARREGAR GRÁFICOS =====
        await carregarGraficos();

    } catch (error) {
        console.error("❌ Erro ao carregar dashboard:", error);
    }
}

// ===== CARREGAR GRÁFICOS =====
async function carregarGraficos() {
    const user = auth.currentUser;
    if (!user) return;

    try {
        const movRef = collection(db, "usuarios", user.uid, "movimentacoes");
        const movSnap = await getDocs(movRef);

        let entradas = 0, saidas = 0;
        const ultimos7Dias = [];

        movSnap.forEach(doc => {
            const tipo = doc.data().tipo;
            const quantidade = Number(doc.data().quantidade);
            
            if (tipo === "ENTRADA") {
                entradas += quantidade;
            } else {
                saidas += quantidade;
            }
        });

        console.log(`✅ Gráficos calculados | Entradas: ${entradas} | Saídas: ${saidas}`);

        // ===== GRÁFICO 1: Barras (Entrada vs Saída) =====
        const ctx1 = document.getElementById('graficoEntradaSaida')?.getContext('2d');
        if (ctx1 && typeof Chart !== 'undefined') {
            if (window.chart1) window.chart1.destroy();
            window.chart1 = new Chart(ctx1, {
                type: 'bar',
                data: {
                    labels: ['Entradas', 'Saídas'],
                    datasets: [{
                        label: 'Quantidade',
                        data: [entradas, saidas],
                        backgroundColor: ['#51cf66', '#ff6b6b'],
                        borderRadius: 5
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: { position: 'top' }
                    },
                    scales: {
                        y: { beginAtZero: true }
                    }
                }
            });
        }

        // ===== GRÁFICO 2: Pizza (Proporção) =====
        const ctx2 = document.getElementById('graficoPizza')?.getContext('2d');
        if (ctx2 && typeof Chart !== 'undefined') {
            if (window.chart2) window.chart2.destroy();
            window.chart2 = new Chart(ctx2, {
                type: 'doughnut',
                data: {
                    labels: ['Entrada', 'Saída'],
                    datasets: [{
                        data: [entradas, saidas],
                        backgroundColor: ['#51cf66', '#ff6b6b'],
                        borderRadius: 5
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: { position: 'top' }
                    }
                }
            });
        }

        // ===== GRÁFICO 3: Linha (Evolução) =====
        const ctx3 = document.getElementById('graficoLinha')?.getContext('2d');
        if (ctx3 && typeof Chart !== 'undefined') {
            if (window.chart3) window.chart3.destroy();
            window.chart3 = new Chart(ctx3, {
                type: 'line',
                data: {
                    labels: ['Semana 1', 'Semana 2', 'Semana 3', 'Semana 4'],
                    datasets: [{
                        label: 'Estoque Total',
                        data: [2000, 2050, 2100, 2078],
                        borderColor: '#001F5B',
                        backgroundColor: 'rgba(0, 31, 91, 0.1)',
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: { position: 'top' }
                    },
                    scales: {
                        y: { beginAtZero: true }
                    }
                }
            });
        }

    } catch (error) {
        console.error("❌ Erro ao carregar gráficos:", error);
    }
}

// ===== FAZER BACKUP =====
window.fazerBackup = async () => {
    const user = auth.currentUser;
    if (!user) {
        alert("Você não está logado!");
        return;
    }

    try {
        console.log("💾 Gerando backup...");
        alert("⏳ Gerando backup...");
        
        const prodRef = collection(db, "usuarios", user.uid, "produtos");
        const prodSnap = await getDocs(prodRef);
        
        const dados = [];
        prodSnap.forEach(doc => {
            dados.push({
                codigo: doc.id,
                ...doc.data()
            });
        });

        const backup = {
            data: new Date().toISOString(),
            usuario: user.email,
            produtos: dados,
            total: dados.length
        };

        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);

        console.log("✅ Backup realizado!");
        alert("✅ Backup realizado com sucesso!");
    } catch (error) {
        console.error("❌ Erro:", error);
        alert("Erro ao fazer backup: " + error.message);
    }
};

// ===== GERAR PDF =====
window.gerarPDF = async () => {
    const user = auth.currentUser;
    if (!user) {
        alert("Você não está logado!");
        return;
    }

    try {
        console.log("📄 Gerando PDF...");
        alert("⏳ Gerando PDF...");
        
        const prodRef = collection(db, "usuarios", user.uid, "produtos");
        const prodSnap = await getDocs(prodRef);
        
        let html = `
            <h1 style="text-align: center; color: #001F5B;">📊 Relatório de Estoque - LogFlow</h1>
            <p><strong>Data:</strong> ${new Date().toLocaleString('pt-BR')}</p>
            <p><strong>Usuário:</strong> ${user.email}</p>
            <table border="1" cellpadding="10" style="width: 100%; border-collapse: collapse;">
                <thead style="background: #001F5B; color: white;">
                    <tr>
                        <th>Código</th>
                        <th>Saldo</th>
                        <th>Última Atualização</th>
                    </tr>
                </thead>
                <tbody>
        `;

        prodSnap.forEach(doc => {
            const data = doc.data();
            const dataFormatada = data.ultima_atualizacao 
                ? new Date(data.ultima_atualizacao.toDate()).toLocaleString('pt-BR')
                : '-';
            
            html += `
                <tr>
                    <td>${doc.id}</td>
                    <td>${data.estoque_atual || 0}</td>
                    <td>${dataFormatada}</td>
                </tr>
            `;
        });

        html += `
                </tbody>
            </table>
            <br>
            <p style="font-size: 12px; color: #666;">Relatório gerado automaticamente pelo LogFlow</p>
        `;

        if (typeof html2pdf === 'undefined') {
            console.error("⚠️ Biblioteca PDF não carregada");
            alert("⚠️ Biblioteca PDF não carregada. Tente novamente.");
            return;
        }

        html2pdf().set({ 
            margin: 10, 
            filename: `relatorio-estoque-${new Date().toISOString().split('T')[0]}.pdf` 
        }).from(html).save();

        console.log("✅ PDF gerado!");
        alert("✅ PDF gerado com sucesso!");

    } catch (error) {
        console.error("❌ Erro:", error);
        alert("Erro ao gerar PDF: " + error.message);
    }
};

// ===== CARREGAR AO INICIAR =====
onAuthStateChanged(auth, (user) => {
    if (user) {
        setTimeout(() => carregarDashboard(), 500);
        // Recarregar a cada 30 segundos
        setInterval(() => carregarDashboard(), 30000);
    }
});

console.log("✅ Dashboard carregado com sucesso!");