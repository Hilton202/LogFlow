import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyBVu2nD3RJg5q-CH-oyxJvn-6agQw09rsA",
    authDomain: "sistema-de-estoque-8ff60.firebaseapp.com",
    projectId: "sistema-de-estoque-8ff60",
    storageBucket: "sistema-de-estoque-8ff60.firebasestorage.app",
    messagingSenderId: "350798221431",
    appId: "1:350798221431:web:ee97b59412b5aa0da2b672"
};

// Ajuste para evitar erro de inicialização duplicada
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);

// 1. Lógica de Login
const btnLogin = document.getElementById('btnLogin');
if (btnLogin) {
    btnLogin.onclick = () => {
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        signInWithEmailAndPassword(auth, email, password)
            .then(() => {
                window.location.href = 'index.html'; 
            })
            .catch((error) => {
                console.error(error);
                const msgErro = document.getElementById('msgErro');
                if (msgErro) msgErro.innerText = "E-mail ou senha incorretos.";
            });
    };
}

// 2. Verificação de Autenticação (Proteção de Páginas)
export function verificarAutenticacao() {
    onAuthStateChanged(auth, (user) => {
        const paginaAtual = window.location.pathname;
        
        // Se NÃO estiver logado e NÃO estiver na login.html, redireciona
        if (!user && !paginaAtual.includes('login.html')) {
            window.location.href = 'login.html';
        }
    });
}

// 3. Função de Sair (EXPORTADA corretamente agora)
export function logout() {
    signOut(auth).then(() => {
        window.location.href = 'login.html';
    }).catch((error) => {
        console.error("Erro ao sair:", error);
    });
}

// Vincula ao window para garantir que o botão no HTML encontre a função
window.logout = logout;