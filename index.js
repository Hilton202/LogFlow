// ===== AUTENTICAÇÃO LOCAL =====
import { verificarAutenticacao } from './auth.js';
verificarAutenticacao();

// ===== IMPORTS FIREBASE (UNIFICADOS) =====
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { 
    getFirestore, doc, setDoc, getDoc, addDoc, collection, 
    serverTimestamp, increment, onSnapshot, query, where, getDocs, Timestamp,
    writeBatch, runTransaction
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
import { registrarAuditoria } from './db.js';

// ===== CONFIGURAÇÃO & INICIALIZAÇÃO FIREBASE =====
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

// ===== ESTADOS DA APLICAÇÃO =====
let operacaoAtual = "ENTRADA";
let produtosDisponiveis = {};
let tentativasFalhadas = 0;

// ===== TEMA ESCURO =====
window.alternarTema = () => {
    const isDark = document.body.classList.toggle('dark-mode');
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
    localStorage.setItem('tema', isDark ? 'dark' : 'light');
};

if (localStorage.getItem('tema') === 'dark') {
    document.body.classList.add('dark-mode');
    document.documentElement.style.colorScheme = 'dark';
}

// ===== SELEÇÃO DE TIPO DE OPERAÇÃO =====
window.selecionarTipo = (tipo) => {
    operacaoAtual = tipo;
    const btnEntrada = document.getElementById('btnEntrada');
    const btnSaida = document.getElementById('btnSaida');

    if (btnEntrada) btnEntrada.classList.remove('active');
    if (btnSaida) btnSaida.classList.remove('active', 'saida');
    
    if (tipo === 'ENTRADA') {
        if (btnEntrada) btnEntrada.classList.add('active');
    } else {
        if (btnSaida) btnSaida.classList.add('active', 'saida');
    }
};

window.addEventListener('tipoAlterado', (e) => { 
    operacaoAtual = e.detail; 
});

// ===== MONITORA PRODUTOS EM TEMPO REAL =====
onAuthStateChanged(auth, (user) => {
    if (!user) {
        console.log("❌ Usuário não autenticado");
        return;
    }

    console.log("✅ Monitorando produtos do usuário:", user.uid);
    
    onSnapshot(collection(db, "usuarios", user.uid, "produtos"), (snapshot) => {
        produtosDisponiveis = {};
        snapshot.forEach(docSnap => {
            const dados = docSnap.data();
            const codigo = docSnap.id;
            const saldo = Number(dados.estoque_atual) || 0;
            produtosDisponiveis[codigo] = {
                codigo,
                nome: dados.nome || codigo,
                saldo
            };
        });
        console.log("📦 Produtos em cache:", Object.keys(produtosDisponiveis).length);
    });
});

// ===== BUSCAR SALDO =====
async function buscarSaldo() {
    const user = auth.currentUser;
    if (!user) return;
    
    const inputCodigo = document.getElementById('codigo');
    const codigo = inputCodigo?.value.trim().toUpperCase();
    const alertaDiv = document.getElementById('alertaEstoque');
    const saldoSpan = document.getElementById('saldoAtual');

    if (!codigo) {
        if (alertaDiv) alertaDiv.style.display = 'none';
        return;
    }
    
    console.log(`🔍 Buscando: ${codigo}`);
    
    try {
        const docRef = doc(db, "usuarios", user.uid, "produtos", codigo);
        const docSnap = await getDoc(docRef);
        
        if (saldoSpan && alertaDiv) {
            if (docSnap.exists()) {
                const saldo = docSnap.data().estoque_atual || 0;
                saldoSpan.innerText = saldo;
                console.log(`✅ ENCONTRADO: ${codigo} = ${saldo} unidades`);
            } else {
                saldoSpan.innerText = "0 (Novo)";
                console.log(`📝 NOVO: ${codigo} será criado ao lançar`);
            }
            alertaDiv.style.display = 'block';
        }
    } catch (error) {
        console.error("❌ ERRO ao buscar saldo:", error);
        if (saldoSpan) saldoSpan.innerText = "Erro";
    }
}

const elCodigo = document.getElementById('codigo');
if (elCodigo) {
    elCodigo.addEventListener('change', buscarSaldo);
    elCodigo.addEventListener('blur', () => setTimeout(buscarSaldo, 100));
}

// ===== AUTOCOMPLETE / FILTRO DE PRODUTOS =====
const inputProduto = document.getElementById('codigo');
const autocompleteLista = document.getElementById('autocompleteLista');

function escaparHTML(texto) {
    const div = document.createElement('div');
    div.textContent = String(texto ?? '');
    return div.innerHTML;
}

function mostrarSugestoesProdutos() {
    if (!inputProduto || !autocompleteLista) return;

    const valor = inputProduto.value.trim().toUpperCase();
    const produtos = Object.values(produtosDisponiveis)
        .filter(produto => {
            if (!valor) return true;
            return produto.codigo.toUpperCase().includes(valor)
                || produto.nome.toUpperCase().includes(valor);
        })
        .sort((a, b) => a.codigo.localeCompare(b.codigo))
        .slice(0, 10);

    if (produtos.length === 0) {
        autocompleteLista.innerHTML = '<div style="padding: 12px; color: #64748b;">Nenhum produto encontrado</div>';
        autocompleteLista.style.display = 'block';
        return;
    }

    autocompleteLista.innerHTML = produtos.map(produto => `
        <div class="produto-sugestao" data-codigo="${escaparHTML(produto.codigo)}" style="padding: 10px; cursor: pointer; border-bottom: 1px solid #e2e8f0;">
            <strong>${escaparHTML(produto.codigo)}</strong>
            <div>${escaparHTML(produto.nome)}</div>
            <small>Saldo: ${produto.saldo} unidades</small>
        </div>
    `).join('');

    autocompleteLista.style.display = 'block';

    autocompleteLista.querySelectorAll('.produto-sugestao').forEach(item => {
        item.addEventListener('mousedown', (evento) => {
            evento.preventDefault();
            selecionarProduto(item.dataset.codigo);
        });
    });
}

if (inputProduto && autocompleteLista) {
    inputProduto.addEventListener('input', mostrarSugestoesProdutos);
    inputProduto.addEventListener('focus', mostrarSugestoesProdutos);
}

window.selecionarProduto = (codigo) => {
    const produto = produtosDisponiveis[codigo];
    if (!inputProduto || !produto) return;

    inputProduto.value = produto.codigo;
    if (autocompleteLista) autocompleteLista.style.display = 'none';

    const saldoSpan = document.getElementById('saldoAtual');
    const alertaDiv = document.getElementById('alertaEstoque');
    if (saldoSpan) saldoSpan.innerText = produto.saldo;
    if (alertaDiv) alertaDiv.style.display = 'block';
};

// ===== MOVIMENTAÇÕES =====
// Execução direta por transação enquanto a hospedagem da Cloud Function não estiver disponível.
async function lancarMovimentacao(dados) {
    const user = auth.currentUser;
    if (!user) throw new Error('Usuário não autenticado');

    const { codigo, quantidade, tipo, referencia } = dados;
    const codigoLimpo = codigo.trim().toUpperCase();

    if (!codigoLimpo || !Number.isFinite(quantidade) || quantidade <= 0) {
        throw new Error('Dados inválidos para a movimentação');
    }

    const produtoRef = doc(db, 'usuarios', user.uid, 'produtos', codigoLimpo);
    const movimentoRef = doc(collection(db, 'usuarios', user.uid, 'movimentacoes'));
    const auditoriaRef = doc(collection(db, 'usuarios', user.uid, 'audit_logs'));

    await runTransaction(db, async (transaction) => {
        const produtoSnap = await transaction.get(produtoRef);
        const saldoAtual = produtoSnap.exists()
            ? Number(produtoSnap.data().estoque_atual || 0)
            : 0;

        if (tipo === 'SAIDA' && quantidade > saldoAtual) {
            const erro = new Error('Saldo insuficiente');
            erro.codigoAplicacao = 'FAILED_PRECONDITION';
            erro.saldoAtual = saldoAtual;
            throw erro;
        }

        const novoSaldo = tipo === 'ENTRADA'
            ? saldoAtual + quantidade
            : saldoAtual - quantidade;

        transaction.set(produtoRef, {
            codigo: codigoLimpo,
            estoque_atual: novoSaldo,
            ultima_atualizacao: serverTimestamp()
        }, { merge: true });

        transaction.set(movimentoRef, {
            codigo: codigoLimpo,
            quantidade,
            tipo,
            referencia: referencia || 'SEM REF',
            data: serverTimestamp()
        });

        transaction.set(auditoriaRef, {
            acao: tipo === 'ENTRADA' ? 'ENTRADA_REALIZADA' : 'SAIDA_REALIZADA',
            dados: {
                codigo: codigoLimpo,
                quantidade,
                referencia: referencia || 'SEM REF'
            },
            timestamp: serverTimestamp()
        });
    });

    return { data: { mensagem: `${tipo === 'ENTRADA' ? 'Entrada' : 'Saída'} registrada com sucesso!` } };
}

// ===== ENVIO DE LANÇAMENTO =====
window.enviarLancamento = async (event) => {
    if (event) event.preventDefault();
    
    const user = auth.currentUser;
    if (!user) {
        alert("❌ Você não está logado!");
        return;
    }

    const codigo = document.getElementById('codigo')?.value.trim().toUpperCase();
    const quantidade = Number(document.getElementById('quantidade')?.value);
    const referencia = document.getElementById('referencia')?.value.trim() || "SEM REF";

    if (!codigo || !quantidade) {
        alert("⚠️ Preencha código e quantidade!");
        return;
    }

    const loader = document.getElementById('loader');
    const btnSubmit = document.getElementById('btnSubmit');
    const mensagem = document.getElementById('mensagemEstoque');
    const form = document.getElementById('formEstoque');

    if (loader) loader.classList.add('active');
    if (btnSubmit) btnSubmit.disabled = true;

    try {
        console.log(`📤 Enviando: ${operacaoAtual} de ${codigo}...`);
        
        const resultado = await lancarMovimentacao({
            codigo,
            quantidade,
            tipo: operacaoAtual,
            referencia
        });

        if (mensagem) {
            mensagem.className = 'alert success';
            mensagem.innerText = `✅ ${resultado.data.mensagem}`;
            mensagem.style.display = 'block';
            setTimeout(() => { mensagem.style.display = 'none'; }, 3000);
        } else {
            alert(`✅ ${resultado.data.mensagem}`);
        }

        if (form) form.reset();
        const alertaEstoque = document.getElementById('alertaEstoque');
        if (alertaEstoque) alertaEstoque.style.display = 'none';
        
        document.getElementById('codigo')?.focus();
        tentativasFalhadas = 0;

    } catch (error) {
        console.error("❌ Erro:", error);
        tentativasFalhadas++;
        
        let textoErro = error.message;
        if (error.codigoAplicacao === 'FAILED_PRECONDITION') {
            textoErro = `❌ SALDO INSUFICIENTE!\nVocê tem: ${error.saldoAtual} unidades`;
        } else if (error.code === 'resource_exhausted') {
            textoErro = `⚠️ MUITAS TENTATIVAS!\nAguarde ${error.details?.proximaTentativaEm || ''} segundos`;
        } else if (error.code === 'failed-precondition') {
            textoErro = `⚠️ DADOS INVÁLIDOS!\n${error.message}`;
        }

        if (mensagem) {
            mensagem.className = 'alert error';
            mensagem.innerText = textoErro;
            mensagem.style.display = 'block';
        } else {
            alert(textoErro);
        }

        // Bloqueio por múltiplas falhas
        if (tentativasFalhadas >= 5 && form) {
            alert("🔒 Muitas tentativas malsucedidas! Sistema bloqueado por 5 minutos!");
            form.style.display = 'none';
            setTimeout(() => {
                form.style.display = 'block';
                tentativasFalhadas = 0;
            }, 5 * 60 * 1000);
        }
    } finally {
        if (loader) loader.classList.remove('active');
        if (btnSubmit) btnSubmit.disabled = false;
    }
};

// Vincula o evento de submit se o formulário existir no DOM
const formEstoque = document.getElementById('formEstoque');
if (formEstoque) {
    formEstoque.onsubmit = window.enviarLancamento;
}

// ===== FECHAR LISTA DE SUGESTÕES AO CLICAR FORA =====
document.addEventListener('click', (evento) => {
    if (!autocompleteLista || !inputProduto) return;
    if (evento.target !== inputProduto && !autocompleteLista.contains(evento.target)) {
        autocompleteLista.style.display = 'none';
    }
});

console.log("✅ Script de estoque otimizado e carregado com sucesso!");