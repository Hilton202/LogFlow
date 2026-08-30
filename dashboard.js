import { verificarAutenticacao } from './auth.js';
verificarAutenticacao();

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";

import{verificarValidadesPróximas} from './notificacaoValidade.js'

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

window.alternarTema = () => {
    const isDark = document.body.classList.toggle('dark-mode');
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
    localStorage.setItem('tema', isDark ? 'dark' : 'light');
};

if (localStorage.getItem('tema') === 'dark') {
    document.body.classList.add('dark-mode');
    document.documentElement.style.colorScheme = 'dark';
}

async function carregarDashboard() {
    const user = auth.currentUser;
    if (!user) return;

    try {
        const prodRef = collection(db, "usuarios", user.uid, "produtos");
        const prodSnap = await getDocs(prodRef);
        
        let totalProdutos = 0;
        let totalEstoque = 0;
        let produtosCriticos = 0;
        const produtosArray = [];

        // Contar movimentações por produto
        const movRef = collection(db, "usuarios", user.uid, "movimentacoes");
        const movSnap = await getDocs(movRef);
        
        const movimentacoesPorProduto = {};
        movSnap.forEach(doc => {
            const codigo = doc.data().codigo;
            const tipo = doc.data().tipo;
            const quantidade = Number(doc.data().quantidade);
            
            if (!movimentacoesPorProduto[codigo]) {
                movimentacoesPorProduto[codigo] = { saidas: 0, entradas: 0 };
            }
            
            if (tipo === "SAIDA") {
                movimentacoesPorProduto[codigo].saidas += quantidade;
            } else {
                movimentacoesPorProduto[codigo].entradas += quantidade;
            }
        });

      prodSnap.forEach(doc => {
            totalProdutos++;
            const dados = doc.data();
            const saldo = dados.estoque_atual || 0;
            totalEstoque += saldo;
            
            // Calcular saídas diárias e cobertura PRIMEIRO
            const mov = movimentacoesPorProduto[doc.id] || { saidas: 0, entradas: 0 };
            const saidasDiarias = parceFloat((mov.saidas / 30).toFixed(2));
            const coberturaCalculada = saidasDiarias > 0 ? Math.ceil(saldo / saidasDiarias) : 999;
            
            // DEPOIS verificar se é crítico
            if (coberturaCalculada <= 20) {
                produtosCriticos++;
            }
            
            // Calcular dias até vencer
            let diasVencer = null;
            if (mov.dataValidade) {
                const dataVal = new Date(mov.dataValidade);
                const hoje = new Date();
                diasVencer = Math.ceil((dataVal - hoje) / (1000 * 60 * 60 * 24));
            }

            produtosArray.push({
                codigo: doc.id,
                saldo: saldo,
                giro: saidasDiarias,
                cobertura: coberturaCalculada,
                diasVencer: diasVencer
            });
        });

        // Verificar produtos próximos de vencer
        produtosArray.forEach(p => {
            if (p.diasVencer !== null && p.diasVencer <= 30 && p.diasVencer > 0) {
                console.log(`⚠️ ${p.codigo} vence em ${p.diasVencer} dias!`);
                // Aqui você pode chamar a notificação do Telegram
                enviarNotificacaoValidade(p.codigo, p.diasVencer);
            }
        });

        const totalMovimentacoes = movSnap.size;

        document.getElementById('volumeTotal').innerText = totalEstoque;
        document.getElementById('itensCriticos').innerText = produtosCriticos;
        document.getElementById('produtosCadastrados').innerText = totalProdutos;
        document.getElementById('movimentacoes').innerText = totalMovimentacoes;

        console.log(`✅ Dashboard: ${totalProdutos} produtos | ${produtosCriticos} críticos | Total: ${totalEstoque}`);

        preencherTabela(produtosArray);
        
        let entradas = 0, saidas = 0;
        movSnap.forEach(d => {
            const tipo = d.data().tipo;
            const qt = Number(d.data().quantidade);
            if (tipo === "ENTRADA") entradas += qt;
            else saidas += qt;
        });
        
        if (typeof Chart !== 'undefined') {
            criarGraficos(entradas, saidas);
        }

    } catch (error) {
        console.error("Erro:", error);
    }
}

function preencherTabela(produtos) {
    const tbody = document.querySelector('#tabelaProdutos tbody');
    if (!tbody) return;

    if (produtos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5">Nenhum produto</td></tr>';
        return;
    }

    tbody.innerHTML = produtos.map(p => `
        <tr>
            <td>${p.codigo}</td>
            <td>${p.saldo}</td>
            <td>${p.giro}</td>
            <td>${p.cobertura}</td>
            <td>${p.saldo <= 20 ? '🛒 COMPRAR' : '✅ OK'}</td>
        </tr>
    `).join('');
    
    // ✅ CHAMAR AQUI DEPOIS DE PREENCHER
    mostrarPagina();
}

function criarGraficos(entradas, saidas) {
    const ctx1 = document.getElementById('graficoEntradaSaida')?.getContext('2d');
    if (ctx1) {
        if (window.chart1) window.chart1.destroy();
        window.chart1 = new Chart(ctx1, {
            type: 'bar',
            data: {
                labels: ['Entradas', 'Saídas'],
                datasets: [{
                    label: 'Quantidade',
                    data: [entradas, saidas],
                    backgroundColor: ['#51cf66', '#ff6b6b']
                }]
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: true,
                scales: { y: { beginAtZero: true } },
                plugins: {
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        padding: 12,
                        titleFont: { size: 14, weight: 'bold' },
                        bodyFont: { size: 13 },
                        borderColor: '#001F5B',
                        borderWidth: 1,
                        displayColors: true,
                        callbacks: {
                            label: function(context) {
                                return context.dataset.label + ': ' + context.parsed.y + ' unidades';
                            }
                        }
                    }
                }
            }
        });
    }

    const ctx2 = document.getElementById('graficoPizza')?.getContext('2d');
    if (ctx2) {
        if (window.chart2) window.chart2.destroy();
        window.chart2 = new Chart(ctx2, {
            type: 'doughnut',
            data: {
                labels: ['Entrada', 'Saída'],
                datasets: [{
                    data: [entradas, saidas],
                    backgroundColor: ['#51cf66', '#ff6b6b']
                }]
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: true,
                plugins: {
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        padding: 12,
                        titleFont: { size: 14, weight: 'bold' },
                        bodyFont: { size: 13 },
                        borderColor: '#001F5B',
                        borderWidth: 1,
                        callbacks: {
                            label: function(context) {
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = ((context.parsed / total) * 100).toFixed(1);
                                return context.label + ': ' + context.parsed + ' un (' + percentage + '%)';
                            }
                        }
                    }
                }
            }
        });
    }
    const ctx3 = document.getElementById('graficoLinha')?.getContext('2d');
    if (ctx3) {
        if (window.chart3) window.chart3.destroy();
        window.chart3 = new Chart(ctx3, {
            type: 'line',
            data: {
                labels: ['Semana 1', 'Semana 2', 'Semana 3', 'Semana 4'],
                datasets: [
                    {
                        label: 'Entradas',
                        data: [entradas * 0.2, entradas * 0.4, entradas * 0.7, entradas],
                        borderColor: '#51cf66',
                        backgroundColor: 'rgba(81, 207, 102, 0.1)',
                        fill: true,
                        tension: 0.4,
                        pointBackgroundColor: '#51cf66',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2,
                        pointRadius: 5
                    },
                    {
                        label: 'Saídas',
                        data: [saidas * 0.15, saidas * 0.35, saidas * 0.6, saidas],
                        borderColor: '#ff6b6b',
                        backgroundColor: 'rgba(255, 107, 107, 0.1)',
                        fill: true,
                        tension: 0.4,
                        pointBackgroundColor: '#ff6b6b',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2,
                        pointRadius: 5
                    }
                ]
            },
            options: { 
                responsive: true,
                maintainAspectRatio: true,
                plugins: { legend: { position: 'top' } },
                scales: { y: { beginAtZero: true } }
            }
        });
    }
}

window.fazerBackup = async () => {
    const user = auth.currentUser;
    if (!user) return alert("Não autenticado!");
    try {
        const prodRef = collection(db, "usuarios", user.uid, "produtos");
        const prodSnap = await getDocs(prodRef);
        const dados = [];
        prodSnap.forEach(doc => dados.push({ codigo: doc.id, ...doc.data() }));
        const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'backup.json';
        a.click();
    } catch (e) {
        alert("Erro: " + e.message);
    }
};

document.getElementById('pesquisa')?.addEventListener('input', (e)=>{
    const termo = e.target.value.toUpperCase();
    const linhas = document.querySelectorAll('#tabelaProdutos tbody tr');

    linhas.forEach(linha => {
        const codigo = linha.querySelector('td:nth-child(1)')?.textContent.toUpperCase()|| '';

         if (termo === '' || codigo.includes(termo)) {
            linha.style.display = 'table-row';
        } else {
            linha.style.display = 'none';
        }
    })
})

// ===== PAGINAÇÃO DE PRODUTOS =====
let paginaAtual = 1;
const PRODUTOS_POR_PAGINA = 15;

function mostrarPagina() {
    const linhas = document.querySelectorAll('#tabelaProdutos tbody tr');
    const totalLinhas = linhas.length;
    const totalPaginas = Math.ceil(totalLinhas / PRODUTOS_POR_PAGINA);

    // Validar página
    if (paginaAtual > totalPaginas && totalPaginas > 0) {
        paginaAtual = totalPaginas;
    }
    if (paginaAtual < 1) {
        paginaAtual = 1;
    }

    // Calcular índices
    const inicio = (paginaAtual - 1) * PRODUTOS_POR_PAGINA;
    const fim = inicio + PRODUTOS_POR_PAGINA;

    // Mostrar/ocultar linhas
    linhas.forEach((linha, index) => {
        if (index >= inicio && index < fim) {
            linha.style.display = 'table-row';
        } else {
            linha.style.display = 'none';
        }
    });

    // Atualizar indicador
    document.getElementById('indicadorPagina').innerText = `Página ${paginaAtual} de ${totalPaginas}`;

    // Desabilitar botões
    document.getElementById('btnAnterior').disabled = paginaAtual === 1;
    document.getElementById('btnProximo').disabled = paginaAtual === totalPaginas;
}

window.proximaPagina = () => {
    paginaAtual++;
    mostrarPagina();
};

window.paginaAnterior = () => {
    paginaAtual--;
    mostrarPagina();
};

// ===== VERIFICAR VALIDADES A CADA 24HORA =====
setInterval(async () => {
    const user = auth.currentUser;
    if (user) {
        console.log("🔍 Verificando produtos próximos de vencer...");
        await verificarValidadesPróximas(user.uid);
    }
}, 86400000); // 24 hora = 3600000 ms

// Também verificar ao carregar a página
onAuthStateChanged(auth, async (user) => {
    if (user) {
        await verificarValidadesPróximas(user.uid);
        setTimeout(() => carregarDashboard(), 500);
    }
    // ✅ LISTENER EM TEMPO REAL - RECARREGA QUANDO PRODUTO É ADICIONADO
        onSnapshot(collection(db, "usuarios", user.uid, "produtos"), (snapshot) => {
            carregarDashboard();
        });
});

// Chamar ao carregar
setTimeout(() => mostrarPagina(), 1000);

window.gerarPDF = async () => {
    alert("PDF em desenvolvimento!");
};

onAuthStateChanged(auth, (user) => {
    if (user) {
        setTimeout(() => carregarDashboard(), 500);
    }
});