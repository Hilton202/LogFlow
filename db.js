import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { 
    getFirestore, // Alterado para a inicialização padrão
    doc, 
    setDoc, 
    increment, 
    collection, 
    addDoc, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyBVu2nD3RJg5q-CH-oyxJvn-6agQw09rsA",
    authDomain: "sistema-de-estoque-8ff60.firebaseapp.com",
    projectId: "sistema-de-estoque-8ff60",
    storageBucket: "sistema-de-estoque-8ff60.firebasestorage.app",
    messagingSenderId: "350798221431",
    appId: "1:350798221431:web:ee97b59412b5aa0da2b672"
};

// 1. Inicializa o App
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// 2. Inicializa o Firestore SEM cache persistente
// Ao usar getFirestore, ele utiliza as configurações padrão (cache em memória apenas)
const db = getFirestore(app);
const auth = getAuth(app);

/**
 * Função para registrar entradas e saídas de produtos no LogFlow
 */
export async function registrarMovimentacao(codigo, qtd, ref, tipo) {
    const user = auth.currentUser;

    if (!user) {
        console.error("Erro: Usuário não está logado!");
        return false;
    }

    if (!codigo || !qtd) {
        console.error("Dados incompletos: Código ou Quantidade ausente.");
        return false;
    }
    
    try {
        const codigoLimpo = codigo.trim().toUpperCase();
        const quantidadeNumerica = Number(qtd);
        const tipoFormatado = tipo.toUpperCase();
        const uid = user.uid;

        // 3. Salva na sub-coleção do usuário logado
        const movRef = collection(db, "usuarios", uid, "movimentacoes");
        
        await addDoc(movRef, {
            codigo: codigoLimpo,
            quantidade: quantidadeNumerica,
            tipo: tipoFormatado,
            referencia: ref || "S/Ref",
            data: serverTimestamp()
        });

        // 4. Atualiza o saldo na sub-coleção de produtos do usuário
        const produtoRef = doc(db, "usuarios", uid, "produtos", codigoLimpo);
        
        await setDoc(produtoRef, {
            codigo: codigoLimpo,
            estoque_atual: increment(tipoFormatado === 'ENTRADA' ? quantidadeNumerica : -quantidadeNumerica),
            ultima_atualizacao: serverTimestamp()
        }, { merge: true });

        console.log(`✅ Sucesso! Dados gravados para o UID: ${uid}`);
        return true;

    } catch (error) {
        console.error("Erro ao gravar no Firebase:", error);
        throw error;
    }
}

export { db, auth };