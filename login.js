import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyBVu2nD3RJg5q-CH-oyxJvn-6agQw09rsA",
    authDomain: "sistema-de-estoque-8ff60.firebaseapp.com",
    projectId: "sistema-de-estoque-8ff60",
    storageBucket: "sistema-de-estoque-8ff60.firebasestorage.app",
    messagingSenderId: "350798221431",
    appId: "1:350798221431:web:ee97b59412b5aa0da2b672"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);

// Redirecionamento preventivo
onAuthStateChanged(auth, (user) => {
    if (user) {
        window.location.replace("dashboard.html");
    }
});

const iniciarLogin = () => {
    // AJUSTADO PARA O SEU HTML:
    const btnEntrar = document.getElementById('btnLogin'); // Mudei para 'btnLogin'
    const inputEmail = document.getElementById('email');
    const inputSenha = document.getElementById('password'); // Mudei para 'password'
    const mensagemErro = document.getElementById('msgErro'); // Mudei para 'msgErro'

    if (!btnEntrar) {
        console.error("ERRO CRÍTICO: Botão não encontrado no HTML.");
        return;
    }

    btnEntrar.onclick = async (e) => {
        e.preventDefault();

        const email = inputEmail.value.trim();
        const senha = inputSenha.value;

        if (!email || !senha) {
            alert("Preencha e-mail e senha.");
            return;
        }

        btnEntrar.innerText = "Entrando...";
        btnEntrar.disabled = true;

        try {
            await signInWithEmailAndPassword(auth, email, senha);
        } catch (error) {
            console.error("Falha no login:", error.code);
            btnEntrar.innerText = "ENTRAR NO SISTEMA";
            btnEntrar.disabled = false;

            if (mensagemErro) {
                mensagemErro.style.display = "block";
                const erros = {
                    'auth/user-not-found': "Usuário não cadastrado.",
                    'auth/wrong-password': "Senha incorreta.",
                    'auth/invalid-email': "E-mail inválido.",
                    'auth/invalid-credential': "Dados de acesso inválidos."
                };
                mensagemErro.innerText = erros[error.code] || "Erro ao entrar. Tente novamente.";
            }
        }
    };
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciarLogin);
} else {
    iniciarLogin();
}