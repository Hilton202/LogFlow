import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
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
const auth = getAuth(app);

const formLogin = document.getElementById('loginForm');
const btnEsqueci = document.getElementById('btnEsqueci');
const modalRecuperacao = document.getElementById('modalRecuperacao');
const formRecuperacao = document.getElementById('formRecuperacao');
const btnFecharModal = document.getElementById('btnFecharModal');
const mensagemReset = document.getElementById('mensagemReset');

const MAXIMO_TENTATIVAS = 5;
const DURACAO_SUSPENSAO_MS = 60 * 60 * 1000;
const PREFIXO_TENTATIVAS = 'logflow_tentativas_';
const PREFIXO_SUSPENSAO = 'logflow_suspensao_';

const mensagemTentativas = document.getElementById('mensagemTentativas');
const contadorSuspensao = document.getElementById('contadorSuspensao');
let intervaloSuspensao = null;

function chavePorEmail(email) {
    return encodeURIComponent(email.trim().toLowerCase());
}

function obterNumeroTentativas(email) {
    return Number(localStorage.getItem(PREFIXO_TENTATIVAS + chavePorEmail(email)) || 0);
}

function obterFimSuspensao(email) {
    return Number(localStorage.getItem(PREFIXO_SUSPENSAO + chavePorEmail(email)) || 0);
}

function limparBloqueio(email) {
    localStorage.removeItem(PREFIXO_TENTATIVAS + chavePorEmail(email));
    localStorage.removeItem(PREFIXO_SUSPENSAO + chavePorEmail(email));
}

function formatarTempoRestante(segundos) {
    const horas = Math.floor(segundos / 3600);
    const minutos = Math.floor((segundos % 3600) / 60);
    const secs = segundos % 60;
    return `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function atualizarSuspensao(email) {
    const btnLogin = formLogin.querySelector('button[type="submit"]');
    const inputEmail = document.getElementById('email');
    const inputSenha = document.getElementById('senha');
    const fim = obterFimSuspensao(email);

    if (!fim) {
        if (intervaloSuspensao) clearInterval(intervaloSuspensao);
        contadorSuspensao.style.display = 'none';
        btnLogin.disabled = false;
        btnLogin.innerText = 'Entrar';
        inputEmail.disabled = false;
        inputSenha.disabled = false;
        return;
    }

    const segundos = Math.max(0, Math.ceil((fim - Date.now()) / 1000));

    if (segundos <= 0) {
        limparBloqueio(email);
        atualizarSuspensao(email);
        return;
    }

    btnLogin.disabled = true;
    inputEmail.disabled = true;
    inputSenha.disabled = true;
    contadorSuspensao.style.display = 'block';
    contadorSuspensao.textContent = `🔒 Conta suspensa. Tente novamente em ${formatarTempoRestante(segundos)}`;

    if (!intervaloSuspensao) {
        intervaloSuspensao = setInterval(() => atualizarSuspensao(email), 1000);
    }
}

function mostrarTentativas(email) {
    const tentativas = obterNumeroTentativas(email);
    if (tentativas > 0 && tentativas < MAXIMO_TENTATIVAS) {
        mensagemTentativas.style.display = 'block';
        mensagemTentativas.textContent = `⚠️ Tentativas incorretas: ${tentativas}/${MAXIMO_TENTATIVAS}`;
    } else {
        mensagemTentativas.style.display = 'none';
    }
}

// LOGIN
formLogin.onsubmit = async (e) => {
    e.preventDefault();

    const email = document.getElementById('email').value.trim().toLowerCase();
    const senha = document.getElementById('senha').value;
    const btnLogin = formLogin.querySelector('button[type="submit"]');

    atualizarSuspensao(email);
    if (obterFimSuspensao(email) > Date.now()) return;

    btnLogin.disabled = true;
    btnLogin.innerText = "⏳ Entrando...";

    try {
        const credencial = await signInWithEmailAndPassword(auth, email, senha);
        await registrarAuditoria(credencial.user.uid, 'LOGIN', { email });
        limparBloqueio(email);
        window.location.href = 'index.html';
    } catch (error) {
        console.error("Erro ao fazer login:", error);

        const falhaDeCredencial = [
            'auth/user-not-found',
            'auth/wrong-password',
            'auth/invalid-credential',
            'auth/invalid-login-credentials'
        ].includes(error.code);

        if (falhaDeCredencial) {
            const chaveTentativas = PREFIXO_TENTATIVAS + chavePorEmail(email);
            const tentativas = obterNumeroTentativas(email) + 1;
            localStorage.setItem(chaveTentativas, String(tentativas));

            if (tentativas >= MAXIMO_TENTATIVAS) {
                const fim = Date.now() + DURACAO_SUSPENSAO_MS;
                localStorage.setItem(PREFIXO_SUSPENSAO + chavePorEmail(email), String(fim));
                mensagemTentativas.style.display = 'none';
                atualizarSuspensao(email);
                alert('🔒 Conta suspensa por 1 hora após 5 tentativas incorretas.');
                return;
            }

            mostrarTentativas(email);
        }

        let mensagem = "❌ Erro ao fazer login!";
        if (falhaDeCredencial) mensagem = "❌ Email ou senha incorretos";
        else if (error.code === 'auth/invalid-email') mensagem = "❌ Email inválido";
        else if (error.code === 'auth/too-many-requests') mensagem = "❌ Muitas tentativas. Tente mais tarde.";

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

const inputEmailLogin = document.getElementById('email');

function atualizarEstadoLoginPorEmail() {
    const email = inputEmailLogin.value.trim().toLowerCase();
    if (!email) return;

    mostrarTentativas(email);
    atualizarSuspensao(email);
}

inputEmailLogin.addEventListener('input', atualizarEstadoLoginPorEmail);
inputEmailLogin.addEventListener('change', atualizarEstadoLoginPorEmail);

window.addEventListener('DOMContentLoaded', () => {
    if (inputEmailLogin.value) atualizarEstadoLoginPorEmail();
});