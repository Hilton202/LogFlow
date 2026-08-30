// ===== AUTENTICAÇÃO LOCAL =====
import { verificarAutenticacao } from './auth.js';
verificarAutenticacao();

// ===== IMPORTS FIREBASE (UNIFICADOS) =====
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { 
    getFirestore, doc, setDoc, getDoc, addDoc, collection, 
    serverTimestamp, increment, onSnapshot, query, where, getDocs, Timestamp,
    writeBatch
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
import { httpsCallable, getFunctions } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-functions.js";

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
const functions = getFunctions(app);

// ===== CLOUD FUNCTIONS =====
const lancarMovimentacao = httpsCallable(functions, 'lancarMovimentacao');

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
            const codigo = docSnap.id;
            const saldo = docSnap.data().estoque_atual || 0;
            produtosDisponiveis[codigo] = saldo;
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
const inputProduto = document.getElementById('inputProduto');
const autocompleteLista = document.getElementById('autocompleteLista');

if (inputProduto && autocompleteLista) {
    inputProduto.addEventListener('input', () => {
        const valor = inputProduto.value.toUpperCase();
        
        if (valor.length < 1) {
            autocompleteLista.style.display = 'none';
            return;
        }

        const produtos = Object.keys(produtosDisponiveis)
            .filter(p => p.includes(valor))
            .slice(0, 5);

        if (produtos.length === 0) {
            autocompleteLista.style.display = 'none';
            return;
        }

        autocompleteLista.innerHTML = produtos
            .map(p => `<div onclick="selecionarProduto('${p}', ${produtosDisponiveis[p]})">${p} (${produtosDisponiveis[p]} un)</div>`)
            .join('');
        
        autocompleteLista.style.display = 'block';
    });
}

window.selecionarProduto = (codigo, saldo) => {
    if (inputProduto) inputProduto.value = codigo;
    if (autocompleteLista) autocompleteLista.style.display = 'none';
    console.log(`✅ Produto selecionado: ${codigo} (${saldo} un)`);
};

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
        if (error.code === 'resource_exhausted') {
            textoErro = `⚠️ MUITAS TENTATIVAS!\nAguarde ${error.details?.proximaTentativaEm || ''} segundos`;
        } else if (error.code === 'failed-precondition') {
            textoErro = `❌ SALDO INSUFICIENTE!\nVocê tem: ${error.details?.saldoAtual} unidades`;
        } else if (error.code === 'not-found') {
            textoErro = `❌ PRODUTO NÃO ENCONTRADO!`;
        } else if (error.code === 'invalid-argument') {
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

console.log("✅ Script de estoque otimizado e carregado com sucesso!");