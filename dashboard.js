import { verificarAutenticacao } from './auth.js';
verificarAutenticacao();

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getFirestore, collection, getDocs, doc, updateDoc, deleteDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
import { registrarAuditoria } from './db.js';

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
        
        const agora = new Date();
        const anoAtual = agora.getFullYear();
        const mesAtual = agora.getMonth();
        const diasDecorridosNoMes = agora.getDate();

        const movimentacoesPorProduto = {};
        const movimentacoesMensais = {};
        const movimentacoesPorAno = {};

        movSnap.forEach(docMov => {
            const dadosMov = docMov.data();
            const codigo = dadosMov.codigo;
            const tipo = dadosMov.tipo;
            const quantidade = Number(dadosMov.quantidade) || 0;

            if (!codigo || quantidade <= 0) return;

            let dataMov = dadosMov.data;
            if (dataMov?.toDate) dataMov = dataMov.toDate();
            else if (dataMov) dataMov = new Date(dataMov);
            else dataMov = null;

            if (!dataMov || Number.isNaN(dataMov.getTime())) return;

            if (!movimentacoesPorProduto[codigo]) {
                movimentacoesPorProduto[codigo] = { saidas: 0, entradas: 0 };
            }

            const ano = dataMov.getFullYear();
            const mes = dataMov.getMonth();

            if (tipo === "ENTRADA") {
                movimentacoesPorProduto[codigo].entradas += quantidade;
            } else if (tipo === "SAIDA") {
                movimentacoesPorProduto[codigo].saidas += quantidade;
            }

            if (ano === anoAtual && mes === mesAtual) {
                if (!movimentacoesMensais[codigo]) {
                    movimentacoesMensais[codigo] = { saidas: 0, entradas: 0 };
                }
                if (tipo === "ENTRADA") movimentacoesMensais[codigo].entradas += quantidade;
                if (tipo === "SAIDA") movimentacoesMensais[codigo].saidas += quantidade;
            }

            if (!movimentacoesPorAno[ano]) movimentacoesPorAno[ano] = {};
            if (!movimentacoesPorAno[ano][codigo]) {
                movimentacoesPorAno[ano][codigo] = { entradas: 0, saidas: 0, nome: dadosMov.nome || codigo };
            }

            if (tipo === "ENTRADA") movimentacoesPorAno[ano][codigo].entradas += quantidade;
            if (tipo === "SAIDA") movimentacoesPorAno[ano][codigo].saidas += quantidade;
        });

        window.relatoriosAnuais = movimentacoesPorAno;

      prodSnap.forEach(doc => {
            totalProdutos++;
            const dados = doc.data();
            const saldo = dados.estoque_atual || 0;
            totalEstoque += saldo;
            
            // Calcular saídas diárias e cobertura PRIMEIRO
            const movMensal = movimentacoesMensais[doc.id] || { saidas: 0, entradas: 0 };
            const saidasDiarias = diasDecorridosNoMes > 0
                ? Number((movMensal.saidas / diasDecorridosNoMes).toFixed(2))
                : 0;
            const coberturaCalculada = saidasDiarias > 0 ? Math.ceil(saldo / saidasDiarias) : 999;
            
            // DEPOIS verificar se é crítico
            if (coberturaCalculada <= 20) {
                produtosCriticos++;
            }
            
            // Calcular dias até vencer
            let diasVencer = null;
            if (dados.data_validade || dados.validade) {
                const dataVal = new Date(dados.data_validade || dados.validade);
                const hoje = new Date();
                diasVencer = Number.isNaN(dataVal.getTime())
                    ? null
                    : Math.ceil((dataVal - hoje) / (1000 * 60 * 60 * 24));
            }

            produtosArray.push({
                codigo: doc.id,
                nome: dados.nome || doc.id,
                saldo: saldo,
                giro: saidasDiarias,
                cobertura: coberturaCalculada,
                diasVencer: diasVencer
            });
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

        // ===== ANO RELATÓRIO =====
        const anoRelatorio = document.getElementById('anoRelatorio');
        if (anoRelatorio) {
            const anosDisponiveis = Object.keys(movimentacoesPorAno)
                .map(Number)
                .sort((a, b) => b - a);

            if (!anoRelatorio.dataset.inicializado) {
                anoRelatorio.innerHTML = anosDisponiveis
                    .map(ano => `<option value="${ano}">${ano}</option>`)
                    .join('');
                anoRelatorio.dataset.inicializado = 'true';
                anoRelatorio.addEventListener('change', () => {
                    preencherRelatorioAnual(anoRelatorio.value);
                });
            }

            if (!anosDisponiveis.includes(Number(anoRelatorio.value))) {
                anoRelatorio.value = anosDisponiveis[0] ? String(anosDisponiveis[0]) : String(anoAtual);
            }

            preencherRelatorioAnual(anoRelatorio.value);
        }

    } catch (error) {
        console.error("Erro:", error);
    }
}

function escaparTextoTabela(valor) {
    const elemento = document.createElement('div');
    elemento.textContent = String(valor ?? '');
    return elemento.innerHTML;
}

let produtosAtuais = [];
let paginaAtual = 1;
const PRODUTOS_POR_PAGINA = 10;

function preencherTabela(produtos) {
    produtosAtuais = Array.isArray(produtos) ? produtos : [];
    paginaAtual = 1;
    renderizarPaginaProdutos();
}

function renderizarPaginaProdutos() {
    const tbody = document.querySelector('#tabelaProdutos tbody');
    if (!tbody) return;

    const termo = (document.getElementById('pesquisa')?.value || '').trim().toUpperCase();
    const filtrados = termo
        ? produtosAtuais.filter(produto =>
            `${produto.nome} ${produto.codigo}`.toUpperCase().includes(termo)
        )
        : produtosAtuais;

    const totalPaginas = Math.max(1, Math.ceil(filtrados.length / PRODUTOS_POR_PAGINA));
    paginaAtual = Math.min(Math.max(1, paginaAtual), totalPaginas);

    const inicio = (paginaAtual - 1) * PRODUTOS_POR_PAGINA;
    const pagina = filtrados.slice(inicio, inicio + PRODUTOS_POR_PAGINA);

    if (pagina.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6">Nenhum produto encontrado</td></tr>';
    } else {
        tbody.innerHTML = pagina.map(p => {
            const nome = escaparTextoTabela(p.nome);
            const codigo = escaparTextoTabela(p.codigo);
            const critico = Number(p.saldo) <= 20;

            return `
            <tr>
                <td data-label="Produto"><div class="produto-nome">${nome}</div><small class="produto-codigo">Cód. ${codigo}</small></td>
                <td data-label="Saldo"><strong class="dado-estoque">${p.saldo}</strong></td>
                <td data-label="Giro mensal">${p.giro} / dia</td>
                <td data-label="Cobertura">${p.cobertura} dias</td>
                <td data-label="Status"><span class="status-produto ${critico ? 'critico' : 'ok'}">${critico ? '🛒 Comprar' : '✅ OK'}</span></td>
                <td data-label="Ações">
                    <button type="button" class="btnEditar" data-codigo="${codigo}" data-nome="${nome.replaceAll('&quot;', '&amp;quot;')}" data-saldo="${p.saldo}">✏️ Editar</button>
                    <button type="button" class="btnExcluir" data-codigo="${codigo}">🗑️ Excluir</button>
                </td>
            </tr>`;
        }).join('');
    }

    tbody.querySelectorAll('.btnEditar').forEach(botao => {
        botao.addEventListener('click', () => editarProduto(botao.dataset.codigo, botao.dataset.nome, Number(botao.dataset.saldo)));
    });

    tbody.querySelectorAll('.btnExcluir').forEach(botao => {
        botao.addEventListener('click', () => excluirProduto(botao.dataset.codigo));
    });

    const indicador = document.getElementById('indicadorPagina');
    const btnAnterior = document.getElementById('btnAnterior');
    const btnProximo = document.getElementById('btnProximo');

    if (indicador) indicador.textContent = `Página ${paginaAtual} de ${filtrados.length ? totalPaginas : 1}`;
    if (btnAnterior) btnAnterior.disabled = paginaAtual <= 1;
    if (btnProximo) btnProximo.disabled = !filtrados.length || paginaAtual >= totalPaginas;

    const controles = document.getElementById('controlesPaginacao');
    if (controles) controles.style.display = filtrados.length ? 'flex' : 'none';
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
                maintainAspectRatio: false,
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
                maintainAspectRatio: false,
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
                maintainAspectRatio: false,
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

document.getElementById('pesquisa')?.addEventListener('input', () => {
    paginaAtual = 1;
    renderizarPaginaProdutos();
});

window.proximaPagina = () => {
    paginaAtual++;
    renderizarPaginaProdutos();
};

window.paginaAnterior = () => {
    paginaAtual--;
    renderizarPaginaProdutos();
};

let cancelarProdutos = null;

onAuthStateChanged(auth, (user) => {
    if (!user) {
        if (cancelarProdutos) cancelarProdutos();
        cancelarProdutos = null;
        window.location.href = 'login.html';
        return;
    }

    if (cancelarProdutos) cancelarProdutos();
    cancelarProdutos = onSnapshot(
        collection(db, 'usuarios', user.uid, 'produtos'),
        () => carregarDashboard(),
        (error) => console.error('Erro no listener de produtos:', error)
    );

    carregarDashboard();
});

document.addEventListener('click', async (e) => {
    if (e.target.classList.contains('btnExcluir')) {
        const codigo = e.target.dataset.codigo;
        const user = auth.currentUser;
        if (!user) return alert("Não autenticado!");

        if (confirm(`Tem certeza que deseja excluir o produto ${codigo}?`)) {
            try {
                // Deletar documento do Firestore
                await deleteDoc(doc(db, "usuarios", user.uid, "produtos", codigo));
                await registrarAuditoria(user.uid, 'PRODUTO_EXCLUIDO', { codigo });
                alert("Produto excluído com sucesso!");
            } catch (e) {
                alert("Erro ao excluir produto: " + e.message);
            }
        }
    }

    if (e.target.classList.contains('btnEditar')) {
        const codigo = e.target.dataset.codigo;
        // Aqui você pode abrir um modal ou redirecionar para uma página de edição
        alert(`Editar produto ${codigo} (em desenvolvimento)`);
    }
});

async function editarProduto(codigo, nomeAtual, saldoAtual) {
    const novoNome = prompt('Novo nome do produto:', nomeAtual);
    if (novoNome === null) return;

    const novoSaldoTexto = prompt('Nova quantidade em estoque:', saldoAtual);
    if (novoSaldoTexto === null) return;

    const novoNomeLimpo = novoNome.trim();
    const novoSaldo = Number(novoSaldoTexto);

    if (!novoNomeLimpo) return alert('O nome não pode ficar vazio!');
    if (!Number.isFinite(novoSaldo) || novoSaldo < 0) {
        return alert('Digite uma quantidade válida!');
    }

    try {
        const user = auth.currentUser;
        if (!user) return alert('Usuário não autenticado!');

        const produtoRef = doc(db, 'usuarios', user.uid, 'produtos', codigo);
        await updateDoc(produtoRef, {
            nome: novoNomeLimpo,
            estoque_atual: novoSaldo
        });

        await registrarAuditoria(user.uid, 'PRODUTO_EDITADO', {
            codigo,
            nome_anterior: nomeAtual,
            nome_novo: novoNomeLimpo,
            quantidade_anterior: saldoAtual,
            quantidade_nova: novoSaldo
        });

        alert('Produto atualizado com sucesso!');
        carregarDashboard();
    } catch (error) {
        console.error(error);
        alert('Erro ao editar: ' + error.message);
    }
}

async function excluirProduto(codigo) {
    if (!confirm(`Deseja realmente excluir o produto ${codigo}?`)) return;

    try {
        const user = auth.currentUser;
        if (!user) return alert('Usuário não autenticado!');

        const produtoRef = doc(db, 'usuarios', user.uid, 'produtos', codigo);
        await deleteDoc(produtoRef);
        await registrarAuditoria(user.uid, 'PRODUTO_EXCLUIDO', { codigo });

        alert('Produto excluído com sucesso!');
        carregarDashboard();
    } catch (error) {
        console.error(error);
        alert('Erro ao excluir: ' + error.message);
    }
}

function preencherRelatorioAnual(anoSelecionado) {
    const ano = String(anoSelecionado);
    const dadosAno = window.relatoriosAnuais?.[ano] || {};
    const tbody = document.querySelector('#tabelaRelatorioAnual tbody');
    if (!tbody) return;

    const linhas = Object.entries(dadosAno)
        .map(([codigo, dados]) => ({
            codigo,
            nome: dados.nome || codigo,
            entradas: dados.entradas || 0,
            saidas: dados.saidas || 0,
            liquido: (dados.entradas || 0) - (dados.saidas || 0)
        }))
        .sort((a, b) => a.nome.localeCompare(b.nome));

    if (linhas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Nenhuma movimentação encontrada para este ano</td></tr>';
        return;
    }

    tbody.innerHTML = linhas.map(item => {
        const nome = escaparTextoTabela(item.nome);
        const codigo = escaparTextoTabela(item.codigo);
        const liquidoClass = item.liquido >= 0 ? 'positivo' : 'negativo';

        return `
        <tr>
            <td data-label="Produto">
                <div class="produto-nome">${nome}</div>
                <small class="produto-codigo">Cód. ${codigo}</small>
            </td>
            <td data-label="Entradas"><strong class="relatorio-entrada">+${item.entradas}</strong></td>
            <td data-label="Saídas"><strong class="relatorio-saida">-${item.saidas}</strong></td>
            <td data-label="Saldo líquido">
                <strong class="relatorio-liquido ${liquidoClass}">${item.liquido >= 0 ? '+' : ''}${item.liquido}</strong>
            </td>
        </tr>`;
    }).join('');

    window.paginaRelatorioAtual = 1;

    function atualizarRelatorio() {
        const itensPorPagina = 5;
        const totalPaginas = Math.max(1, Math.ceil(linhas.length / itensPorPagina));
        window.paginaRelatorioAtual = Math.min(window.paginaRelatorioAtual, totalPaginas);

        const inicio = (window.paginaRelatorioAtual - 1) * itensPorPagina;
        const linhasPagina = linhas.slice(inicio, inicio + itensPorPagina);

        tbody.innerHTML = linhasPagina.map(item => {
            const nome = escaparTextoTabela(item.nome);
            const codigo = escaparTextoTabela(item.codigo);
            const liquidoClass = item.liquido >= 0 ? 'positivo' : 'negativo';

            return `
            <tr>
                <td data-label="Produto">
                    <div class="produto-nome">${nome}</div>
                    <small class="produto-codigo">Cód. ${codigo}</small>
                </td>
                <td data-label="Entradas"><strong class="relatorio-entrada">+${item.entradas}</strong></td>
                <td data-label="Saídas"><strong class="relatorio-saida">-${item.saidas}</strong></td>
                <td data-label="Saldo líquido"><strong class="relatorio-liquido ${liquidoClass}">${item.liquido >= 0 ? '+' : ''}${item.liquido}</strong></td>
            </tr>`;
        }).join('');

        document.getElementById('indicadorRelatorio').textContent = `Página ${window.paginaRelatorioAtual} de ${totalPaginas}`;
        document.getElementById('btnRelatorioAnterior').disabled = window.paginaRelatorioAtual <= 1;
        document.getElementById('btnRelatorioProximo').disabled = window.paginaRelatorioAtual >= totalPaginas;
    }

    document.getElementById('btnRelatorioAnterior').onclick = () => {
        window.paginaRelatorioAtual = Math.max(1, window.paginaRelatorioAtual - 1);
        atualizarRelatorio();
    };

    document.getElementById('btnRelatorioProximo').onclick = () => {
        window.paginaRelatorioAtual++;
        atualizarRelatorio();
    };

    atualizarRelatorio();
}

window.exportarRelatorioAnualCSV = () => {
    const ano = document.getElementById('anoRelatorio')?.value;
    const dadosAno = window.relatoriosAnuais?.[ano] || {};
    const linhas = [['Produto', 'Codigo', 'Entradas', 'Saidas', 'Saldo liquido']];

    Object.entries(dadosAno).forEach(([codigo, dados]) => {
        linhas.push([
            dados.nome || codigo,
            codigo,
            dados.entradas || 0,
            dados.saidas || 0,
            (dados.entradas || 0) - (dados.saidas || 0)
        ]);
    });

    const csv = linhas
        .map(linha => linha.map(valor => `"${String(valor).replaceAll('"', '""')}"`).join(';'))
        .join('\n');

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `relatorio-anual-${ano}.csv`;
    link.click();
    URL.revokeObjectURL(url);
};