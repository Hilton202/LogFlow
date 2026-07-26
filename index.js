import { verificarAutenticacao } from './auth.js';
verificarAutenticacao();

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { 
    getFirestore, doc, setDoc, getDoc, addDoc, collection, 
    serverTimestamp, increment, onSnapshot, query, where, getDocs, Timestamp,
    writeBatch
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
import { httpsCallable, getFunctions } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-functions.js";

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

let operacaoAtual = "ENTRADA";
let produtosDisponiveis = {};
let tentativasFalhadas = 0;

// ===== TEMA ESCURO =====
window.alternarTema = () => {
    document.documentElement.style.colorScheme = document.body.classList.toggle('dark-mode') ? 'dark' : 'light';
    localStorage.setItem('tema', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
};

if (localStorage.getItem('tema') === 'dark') {
    document.body.classList.add('dark-mode');
    document.documentElement.style.colorScheme = 'dark';
}

// ===== MONITORA PRODUTOS EM TEMPO REAL =====
onAuthStateChanged(auth, (user) => {
    if (!user) {
        console.log("❌ Usuário não autenticado");
        return;
    }

    console.log("✅ Monitorando produtos do usuário:", user.uid);
    
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

// ===== BUSCAR SALDO =====
async function buscarSaldo() {
    const user = auth.currentUser;
    if (!user) return;
    
    const codigo = document.getElementById('codigo')?.value.trim().toUpperCase();
    if (!codigo) {
        document.getElementById('alertaEstoque').style.display = 'none';
        return;
    }
    
    console.log(`🔍 Buscando: ${codigo}`);
    
    try {
        const docRef = doc(db, "usuarios", user.uid, "produtos", codigo);
        const docSnap = await getDoc(docRef);
        
        const saldoSpan = document.getElementById('saldoAtual');
        const alertaDiv = document.getElementById('alertaEstoque');
        
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
        const saldoSpan = document.getElementById('saldoAtual');
        if (saldoSpan) saldoSpan.innerText = "Erro";
    }
}

if (document.getElementById('codigo')) {
    document.getElementById('codigo').addEventListener('change', buscarSaldo);
    document.getElementById('codigo').addEventListener('blur', () => setTimeout(buscarSaldo, 100));
}

// ===== TIPO ALTERADO =====
window.addEventListener('tipoAlterado', (e) => { operacaoAtual = e.detail; });

// ===== FORMULÁRIO DE ENTRADA/SAÍDA =====
const form = document.getElementById('formEstoque');
if (form) {
    form.onsubmit = async (e) => {
        e.preventDefault();
        
        const user = auth.currentUser;
        if (!user) {
            alert("Você não está logado!");
            return;
        }

        const codigo = document.getElementById('codigo')?.value.trim().toUpperCase();
        const quantidade = Number(document.getElementById('quantidade').value);
        const ref = document.getElementById('referencia')?.value.trim() || "SEM REF";
        
        if (!codigo || !quantidade) {
            alert("⚠️ Preencha código e quantidade!");
            return;
        }

        try {
            console.log(`📤 Enviando para Cloud Function: ${operacaoAtual} de ${codigo}...`);
            
            // 🔐 CHAMAR CLOUD FUNCTION (validação server-side)
            const resultado = await lancarMovimentacao({
                codigo,
                quantidade,
                tipo: operacaoAtual,
                referencia: ref
            });

            console.log("✅ Cloud Function respondeu:", resultado.data);
            
            form.reset();
            alert(`✅ ${resultado.data.mensagem}`);
            document.getElementById('codigo').focus();
            tentativasFalhadas = 0;

        } catch (error) {
            console.error("❌ Erro:", error);
            tentativasFalhadas++;
            
            if (error.code === 'resource_exhausted') {
                alert(`⚠️ MUITAS TENTATIVAS!\n\nAguarde ${error.details.proximaTentativaEm} segundos`);
            } else if (error.code === 'failed-precondition') {
                alert(`❌ SALDO INSUFICIENTE!\n\nVocê tem: ${error.details.saldoAtual} unidades`);
            } else if (error.code === 'not-found') {
                alert(`❌ PRODUTO NÃO ENCONTRADO!`);
            } else if (error.code === 'invalid-argument') {
                alert(`⚠️ DADOS INVÁLIDOS!\n\n${error.message}`);
            } else {
                alert(`❌ Erro: ${error.message}`);
            }
            
            if (tentativasFalhadas >= 5) {
                alert("🔒 Muitas tentativas malsucedidas! Sistema bloqueado por 5 minutos!");
                form.style.display = 'none';
                setTimeout(() => {
                    form.style.display = 'block';
                    tentativasFalhadas = 0;
                }, 5 * 60 * 1000);
            }
        }
    };
}

// ===== FILTRO DE PRODUTOS =====
const inputProduto = document.getElementById('inputProduto');
const autocompleteLista = document.getElementById('autocompleteLista');

if (inputProduto) {
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
    inputProduto.value = codigo;
    autocompleteLista.style.display = 'none';
    console.log(`✅ Produto selecionado: ${codigo} (${saldo} un)`);
};

console.log("✅ Index (Scanner) carregado com sucesso!");