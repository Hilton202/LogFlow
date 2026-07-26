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

// ===== FUNÇÃO DE LOGIN (chamada quando elemento existe) =====
export function inicializarLogin() {
    const btnLogin = document.getElementById('btnLogin');
    if (btnLogin) {
        btnLogin.onclick = () => {
            const email = document.getElementById('email')?.value;
            const password = document.getElementById('password')?.value;

            if (!email || !password) {
                const msgErro = document.getElementById('msgErro');
                if (msgErro) msgErro.innerText = "Preencha email e senha!";
                return;
            }

            signInWithEmailAndPassword(auth, email, password)
                .then(() => {
                    window.location.href = 'index.html'; 
                })
                .catch((error) => {
                    console.error("Erro de login:", error.code);
                    const msgErro = document.getElementById('msgErro');
                    if (msgErro) {
                        if (error.code === 'auth/user-not-found') {
                            msgErro.innerText = "Usuário não encontrado!";
                        } else if (error.code === 'auth/wrong-password') {
                            msgErro.innerText = "Senha incorreta!";
                        } else {
                            msgErro.innerText = "Erro ao fazer login. Tente novamente.";
                        }
                    }
                });
        };
    }
}

// ===== VERIFICAÇÃO DE AUTENTICAÇÃO (Proteção de Páginas) =====
export function verificarAutenticacao() {
    onAuthStateChanged(auth, (user) => {
        const paginaAtual = window.location.pathname;
        
        // Se NÃO estiver logado e NÃO estiver na login.html, redireciona
        if (!user && !paginaAtual.includes('login.html')) {
            window.location.href = 'login.html';
        }
    });
}

// ===== FUNÇÃO DE LOGOUT =====
export function logout() {
    signOut(auth).then(() => {
        window.location.href = 'login.html';
    }).catch((error) => {
        console.error("Erro ao sair:", error);
    });
}

// Vincula ao window para garantir acessibilidade
window.logout = logout;
window.inicializarLogin = inicializarLogin;