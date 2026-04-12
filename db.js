import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { 
    initializeFirestore, 
    persistentLocalCache, 
    doc, 
    setDoc, 
    increment, 
    collection, 
    addDoc, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

// Configuração do Firebase
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

// 2. Inicializa o Firestore com o NOVO sistema de Cache (Sem avisos de depreciação)
const db = initializeFirestore(app, {
    localCache: persistentLocalCache()
});

/**
 * Função para registrar entradas e saídas de produtos
 */
export async function registrarMovimentacao(codigo, qtd, ref, tipo) {
    if (!codigo || !qtd) {
        console.error("Dados incompletos: Código ou Quantidade ausente.");
        return false;
    }
    
    try {
        const codigoLimpo = codigo.trim().toUpperCase();
        const quantidadeNumerica = Number(qtd);
        const tipoFormatado = tipo.toUpperCase();

        // 1. Salva o histórico da movimentação
        await addDoc(collection(db, "movimentacoes"), {
            codigo: codigoLimpo,
            quantidade: quantidadeNumerica,
            tipo: tipoFormatado,
            referencia: ref || "S/Ref",
            data: serverTimestamp()
        });

        // 2. Atualiza o saldo real do produto
        const produtoRef = doc(db, "produtos", codigoLimpo);
        
        await setDoc(produtoRef, {
            codigo: codigoLimpo,
            estoque_atual: increment(tipoFormatado === 'ENTRADA' ? quantidadeNumerica : -quantidadeNumerica),
            ultima_atualizacao: serverTimestamp()
        }, { merge: true });

        console.log(`✅ Movimentação de ${tipoFormatado}: ${quantidadeNumerica} un no item ${codigoLimpo}`);
        return true;

    } catch (error) {
        console.error("Erro crítico no Firebase:", error);
        throw error;
    }
}

export { db };