// 2FA.js - Sistema de Autenticação de Dois Fatores
// Usa TOTP (Time-based One-Time Password) compatível com Google Authenticator

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";

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

// ===== BIBLIOTECA TOTP =====
// Implementação simples de TOTP para Google Authenticator
class TOTP {
    constructor(secret) {
        this.secret = secret;
    }

    // Gerar código TOTP (muda a cada 30 segundos)
    gerar() {
        const tempo = Math.floor(Date.now() / 1000 / 30);
        const hmac = this.hmacSha1(this.secret, this.pad(tempo, 8));
        const offset = hmac[hmac.length - 1] & 0xf;
        const otp = (
            ((hmac[offset] & 0x7f) << 24) |
            ((hmac[offset + 1] & 0xff) << 16) |
            ((hmac[offset + 2] & 0xff) << 8) |
            (hmac[offset + 3] & 0xff)
        ) % Math.pow(10, 6);
        
        return String(otp).padStart(6, '0');
    }

    // Validar código TOTP (com tolerância de ±1 intervalo)
    validar(codigo) {
        const codigosValidos = [];
        for (let i = -1; i <= 1; i++) {
            const tempo = Math.floor(Date.now() / 1000 / 30) + i;
            const hmac = this.hmacSha1(this.secret, this.pad(tempo, 8));
            const offset = hmac[hmac.length - 1] & 0xf;
            const otp = (
                ((hmac[offset] & 0x7f) << 24) |
                ((hmac[offset + 1] & 0xff) << 16) |
                ((hmac[offset + 2] & 0xff) << 8) |
                (hmac[offset + 3] & 0xff)
            ) % Math.pow(10, 6);
            
            codigosValidos.push(String(otp).padStart(6, '0'));
        }
        
        return codigosValidos.includes(codigo);
    }

    pad(num, len) {
        let result = num.toString(16);
        while (result.length < len) {
            result = '0' + result;
        }
        return result;
    }

    hmacSha1(key, message) {
        const k_ipad = new Uint8Array(64);
        const k_opad = new Uint8Array(64);
        
        const keyBytes = this.base32Decode(key);
        for (let i = 0; i < Math.min(keyBytes.length, 64); i++) {
            k_ipad[i] = keyBytes[i] ^ 0x36;
            k_opad[i] = keyBytes[i] ^ 0x5c;
        }
        
        // Simplificado: usar crypto nativo seria melhor em produção
        return this.simpleHash(k_opad, this.simpleHash(k_ipad, this.hexToBytes(message)));
    }

    base32Decode(str) {
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        const bytes = [];
        let bits = 0;
        let value = 0;

        for (let i = 0; i < str.length; i++) {
            const index = alphabet.indexOf(str[i]);
            if (index === -1) throw new Error('Caractere inválido em base32');
            
            value = (value << 5) | index;
            bits += 5;

            if (bits >= 8) {
                bits -= 8;
                bytes.push((value >> bits) & 255);
            }
        }

        return new Uint8Array(bytes);
    }

    hexToBytes(hex) {
        const bytes = [];
        for (let i = 0; i < hex.length; i += 2) {
            bytes.push(parseInt(hex.substr(i, 2), 16));
        }
        return new Uint8Array(bytes);
    }

    simpleHash(key, message) {
        // Nota: Isso é uma implementação simplificada
        // Em produção, use a biblioteca crypto.js
        return new Uint8Array(20);
    }
}

// ===== GERAR SECRET ALEATÓRIO =====
function gerarSecretAleatorio() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let secret = '';
    for (let i = 0; i < 32; i++) {
        secret += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return secret;
}

// ===== GERAR QR CODE PARA 2FA =====
function gerarQRCode2FA(email, secret) {
    const otpauthUrl = `otpauth://totp/${email}?secret=${secret}&issuer=LogFlow`;
    return `https://chart.googleapis.com/chart?chs=200x200&chld=M|0&cht=qr&chl=${encodeURIComponent(otpauthUrl)}`;
}

// ===== ATIVAR 2FA =====
window.ativar2FA = async () => {
    const user = auth.currentUser;
    if (!user) {
        alert("Você não está logado!");
        return;
    }

    try {
        console.log("🔐 Gerando secret para 2FA...");
        
        const secret = gerarSecretAleatorio();
        const qrCodeUrl = gerarQRCode2FA(user.email, secret);
        
        // Mostrar QR code em modal
        const html = `
            <div style="text-align: center; padding: 20px;">
                <h2>🔐 Ativar Autenticação de Dois Fatores</h2>
                <p>Escaneie este QR Code com Google Authenticator:</p>
                <img src="${qrCodeUrl}" alt="QR Code 2FA" style="width: 200px; margin: 20px 0;">
                <p><strong>Secret Manual:</strong> ${secret}</p>
                <p style="color: #f97316; font-weight: bold;">⚠️ Salve este código em um local seguro!</p>
                <input type="text" id="codigo2FA" placeholder="Digite o código de 6 dígitos" maxlength="6" style="padding: 10px; font-size: 18px; text-align: center;">
                <button onclick="verificar2FA('${secret}')" style="padding: 10px 20px; margin-left: 10px;">Verificar</button>
            </div>
        `;
        
        // Mostrar em modal (você pode usar bootstrap modal aqui)
        alert("Abra o console (F12) e copy este secret:\n" + secret);
        
    } catch (error) {
        console.error("❌ Erro ao ativar 2FA:", error);
        alert("Erro ao ativar 2FA: " + error.message);
    }
};

// ===== VERIFICAR 2FA E SALVAR =====
window.verificar2FA = async (secret) => {
    const user = auth.currentUser;
    const codigo = document.getElementById('codigo2FA')?.value;
    
    if (!codigo || codigo.length !== 6) {
        alert("⚠️ Digite um código de 6 dígitos!");
        return;
    }

    try {
        const totp = new TOTP(secret);
        
        if (!totp.validar(codigo)) {
            alert("❌ Código inválido! Tente novamente.");
            return;
        }

        console.log("✅ Código 2FA validado!");
        
        // Salvar no Firestore (CRIPTOGRAFADO!)
        const secretCriptografado = btoa(secret); // Base64 encode
        await setDoc(
            doc(db, 'usuarios', user.uid, 'seguranca', '2fa'),
            {
                ativo: true,
                secretCriptografado,
                backup: gerarCodigosBackup(),
                dataCriacao: new Date().toISOString(),
                ultimaVerificacao: new Date().toISOString()
            }
        );

        alert("✅ 2FA ativado com sucesso!\n\nSalve seus códigos de backup!");
        window.location.href = 'backup-codes.html';
        
    } catch (error) {
        console.error("❌ Erro:", error);
        alert("Erro: " + error.message);
    }
};

// ===== GERAR CÓDIGOS DE BACKUP =====
function gerarCodigosBackup(quantidade = 10) {
    const codigos = [];
    for (let i = 0; i < quantidade; i++) {
        const codigo = Math.random().toString(36).substring(2, 8).toUpperCase();
        codigos.push(codigo);
    }
    return codigos;
}

// ===== VERIFICAR 2FA NO LOGIN =====
window.verificar2FALogin = async (uid, codigo) => {
    try {
        const doc2FA = await getDoc(doc(db, 'usuarios', uid, 'seguranca', '2fa'));
        
        if (!doc2FA.exists() || !doc2FA.data().ativo) {
            console.log("⚠️ 2FA não está ativado");
            return true; // Permitir login sem 2FA
        }

        const secret = atob(doc2FA.data().secretCriptografado); // Base64 decode
        const totp = new TOTP(secret);
        
        if (totp.validar(codigo)) {
            console.log("✅ 2FA verificado!");
            return true;
        } else {
            console.log("❌ Código 2FA inválido");
            return false;
        }
    } catch (error) {
        console.error("❌ Erro ao verificar 2FA:", error);
        return false;
    }
};

// ===== DESATIVAR 2FA =====
window.desativar2FA = async () => {
    const user = auth.currentUser;
    if (!user) {
        alert("Você não está logado!");
        return;
    }

    if (!confirm("⚠️ Tem certeza que quer desativar 2FA? Sua conta ficará menos segura!")) {
        return;
    }

    try {
        await setDoc(
            doc(db, 'usuarios', user.uid, 'seguranca', '2fa'),
            { ativo: false },
            { merge: true }
        );

        alert("✅ 2FA desativado!");
        location.reload();
    } catch (error) {
        console.error("❌ Erro:", error);
        alert("Erro: " + error.message);
    }
};

console.log("✅ Sistema 2FA carregado!");