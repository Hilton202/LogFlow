import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";

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

const formLogin = document.getElementById('loginForm');
const btnEsqueci = document.getElementById('btnEsqueci');
const modalRecuperacao = document.getElementById('modalRecuperacao');
const formRecuperacao = document.getElementById('formRecuperacao');
const btnFecharModal = document.getElementById('btnFecharModal');
const mensagemReset = document.getElementById('mensagemReset');

// LOGIN
formLogin.onsubmit = async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('email').value;
    const senha = document.getElementById('senha').value;
    const btnLogin = formLogin.querySelector('button[type="submit"]');
    
    btnLogin.disabled = true;
    btnLogin.innerText = "⏳ Entrando...";
    
    try {
        await signInWithEmailAndPassword(auth, email, senha);
        window.location.href = 'index.html';
    } catch (error) {
        console.error("Erro ao fazer login:", error);
        
        let mensagem = "❌ Erro ao fazer login!";
        
        if (error.code === 'auth/user-not-found') {
            mensagem = "❌ Usuário não encontrado";
        } else if (error.code === 'auth/wrong-password') {
            mensagem = "❌ Senha incorreta";
        } else if (error.code === 'auth/invalid-email') {
            mensagem = "❌ Email inválido";
        } else if (error.code === 'auth/too-many-requests') {
            mensagem = "❌ Muitas tentativas. Tente mais tarde.";
        }
        
        alert(mensagem);
        btnLogin.disabled = false;
        btnLogin.innerText = "Entrar";
    }
};

// ABRIR MODAL DE RECUPERAÇÃO
btnEsqueci.onclick = () => {
    modalRecuperacao.style.display = 'flex';
    mensagemReset.innerHTML = '';
};

// FECHAR MODAL
btnFecharModal.onclick = () => {
    modalRecuperacao.style.display = 'none';
    formRecuperacao.reset();
    mensagemReset.innerHTML = '';
};

// FECHAR MODAL AO CLICAR FORA
modalRecuperacao.onclick = (e) => {
    if (e.target === modalRecuperacao) {
        modalRecuperacao.style.display = 'none';
        formRecuperacao.reset();
        mensagemReset.innerHTML = '';
    }
};

// RECUPERAR SENHA
formRecuperacao.onsubmit = async (e) => {
    e.preventDefault();
    
    const emailReset = document.getElementById('emailReset').value;
    const btnEnviar = formRecuperacao.querySelector('button[type="submit"]');
    
    btnEnviar.disabled = true;
    btnEnviar.innerText = "⏳ Enviando...";
    
    try {
        await sendPasswordResetEmail(auth, emailReset);
        
        mensagemReset.innerHTML = `
            <div style="background: #dcfce7; border: 1px solid #22c55e; color: #166534; padding: 15px; border-radius: 5px; text-align: center;">
                <strong>✅ Email enviado com sucesso!</strong><br>
                <small>Verifique sua caixa de entrada (ou spam) para o link de recuperação de senha.</small>
            </div>
        `;
        
        formRecuperacao.reset();
        
        setTimeout(() => {
            modalRecuperacao.style.display = 'none';
            mensagemReset.innerHTML = '';
        }, 3000);
        
    } catch (error) {
        console.error("Erro ao enviar reset:", error);
        
        let mensagem = "❌ Erro ao enviar email de recuperação";
        
        if (error.code === 'auth/user-not-found') {
            mensagem = "❌ Email não encontrado no sistema";
        } else if (error.code === 'auth/invalid-email') {
            mensagem = "❌ Email inválido";
        } else if (error.code === 'auth/too-many-requests') {
            mensagem = "❌ Muitas tentativas. Tente mais tarde.";
        }
        
        mensagemReset.innerHTML = `
            <div style="background: #fee2e2; border: 1px solid #ef4444; color: #991b1b; padding: 15px; border-radius: 5px; text-align: center;">
                <strong>${mensagem}</strong>
            </div>
        `;
        
        btnEnviar.disabled = false;
        btnEnviar.innerText = "Enviar Link";
    }
};