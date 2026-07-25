import { verificarAutenticacao } from './auth.js';
verificarAutenticacao();

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getFirestore, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
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

let todosProdutos = [];
let produtoSelecionado = null;

// ===== TEMA ESCURO =====
window.alternarTema = () => {
    document.documentElement.style.colorScheme = document.body.classList.toggle('dark-mode') ? 'dark' : 'light';
    localStorage.setItem('tema', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
};

if (localStorage.getItem('tema') === 'dark') {
    document.body.classList.add('dark-mode');
    document.documentElement.style.colorScheme = 'dark';
}

// ===== AUTOCOMPLETE =====
const inputProduto = document.getElementById('inputProduto');
const autocompleteLista = document.getElementById('autocompleteLista');
const previewEtiqueta = document.getElementById('previewEtiqueta');
const produtoSelecionadoDiv = document.getElementById('produtoSelecionado');
const btnImprimir = document.getElementById('btnImprimir');

console.log("🔍 Elementos carregados:", {
    inputProduto: !!inputProduto,
    autocompleteLista: !!autocompleteLista,
    previewEtiqueta: !!previewEtiqueta,
    produtoSelecionadoDiv: !!produtoSelecionadoDiv,
    btnImprimir: !!btnImprimir
});

inputProduto.addEventListener('input', (e) => {
    const valor = e.target.value.toUpperCase().trim();
    
    if (valor.length === 0) {
        autocompleteLista.style.display = 'none';
        return;
    }

    const filtrados = todosProdutos.filter(p => 
        p.codigo.includes(valor) || p.codigo.startsWith(valor)
    );

    if (filtrados.length === 0) {
        autocompleteLista.innerHTML = '<div class="autocomplete-item"><small>Nenhum produto encontrado</small></div>';
        autocompleteLista.style.display = 'block';
        return;
    }

    let html = '';
    filtrados.slice(0, 10).forEach(p => {
        const saldo = Number(p.estoque_atual) || 0;
        html += `
            <div class="autocomplete-item" onclick="selecionarProduto('${p.codigo}', '${p.codigo}', ${saldo})">
                <strong>📦 ${p.codigo}</strong>
                <small>Saldo: ${saldo} unidades</small>
            </div>
        `;
    });

    autocompleteLista.innerHTML = html;
    autocompleteLista.style.display = 'block';
});

// Fechar autocomplete ao clicar fora
document.addEventListener('click', (e) => {
    if (e.target !== inputProduto) {
        autocompleteLista.style.display = 'none';
    }
});

window.selecionarProduto = (codigo, nome, saldo) => {
    console.log("✅ Produto selecionado:", codigo, saldo);
    
    produtoSelecionado = { codigo, nome, saldo };
    
    inputProduto.value = codigo;
    autocompleteLista.style.display = 'none';
    
    // Mostrar dados do produto
    document.getElementById('produtoNome').innerText = `${codigo}`;
    document.getElementById('produtoSaldo').innerText = `Saldo: ${saldo} unidades`;
    produtoSelecionadoDiv.style.display = 'block';
    
    // Gerar QR Code
    console.log("📊 Chamando gerarQRCode...");
    gerarQRCode();
    
    // Ativar botão de impressão
    btnImprimir.disabled = false;
    console.log("✅ Botão de impressão ativado!");
};

function gerarQRCode() {
    if (!produtoSelecionado) {
        console.log("❌ Nenhum produto selecionado");
        return;
    }

    if (!previewEtiqueta) {
        console.error("❌ previewEtiqueta é NULL! HTML está carregado?");
        return;
    }

    const tamanhoQR = Number(document.getElementById('tamanhoQR').value);
    const dataQR = JSON.stringify({
        codigo: produtoSelecionado.codigo,
        saldo: produtoSelecionado.saldo,
        data: new Date().toLocaleDateString('pt-BR')
    });

    console.log("📊 Gerando QR Code:", dataQR);

    // Atualizar preview
    previewEtiqueta.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; gap: 15px;">
            <div class="etiqueta-nome">${produtoSelecionado.codigo}</div>
            <div id="qrcode-container" style="display: flex; justify-content: center;"></div>
            <div class="etiqueta-info">
                <strong>Saldo:</strong> ${produtoSelecionado.saldo} un.<br>
                <strong>Data:</strong> ${new Date().toLocaleDateString('pt-BR')}
            </div>
        </div>
    `;

    // Aguardar o elemento ser renderizado antes de gerar QR
    setTimeout(() => {
        try {
            const qrElement = document.getElementById('qrcode-container');
            if (!qrElement) {
                console.error("❌ Elemento qrcode-container não encontrado!");
                return;
            }
            
            qrElement.innerHTML = ''; // Limpar antes
            
            new QRCode(qrElement, {
                text: dataQR,
                width: tamanhoQR,
                height: tamanhoQR,
                colorDark: "#001F5B",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.H
            });
            
            console.log("✅ QR Code gerado com sucesso!");
        } catch (error) {
            console.error("❌ Erro ao gerar QR Code:", error);
        }
    }, 100);
}

// Regenerar QR Code quando tamanho mudar
document.getElementById('tamanhoQR').addEventListener('change', gerarQRCode);

window.imprimirEtiquetas = () => {
    if (!produtoSelecionado) {
        alert("Selecione um produto!");
        return;
    }

    const quantidade = Number(document.getElementById('quantidadeEtiquetas').value);
    
    if (quantidade <= 0) {
        alert("Digite uma quantidade válida!");
        return;
    }

    // Criar uma janela de impressão
    const janelaImpressao = window.open('', '', 'width=800,height=600');
    
    let htmlImpressao = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Imprimir Etiquetas - ${produtoSelecionado.codigo}</title>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><\/script>
            <style>
                body { margin: 0; padding: 0; font-family: Arial; }
                .etiqueta {
                    width: 10cm;
                    height: 10cm;
                    border: 1px solid #ccc;
                    page-break-after: always;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    padding: 10px;
                    box-sizing: border-box;
                }
                .codigo { font-weight: bold; font-size: 18px; margin-bottom: 10px; }
                .qr { margin: 10px 0; }
                .info { font-size: 11px; text-align: center; }
                @media print {
                    body { margin: 0; padding: 0; }
                    .etiqueta { page-break-after: always; border: none; }
                }
            </style>
        </head>
        <body>
    `;

    // Repetir etiqueta N vezes
    for (let i = 0; i < quantidade; i++) {
        const idQR = `qr-${i}`;
        htmlImpressao += `
            <div class="etiqueta">
                <div class="codigo">${produtoSelecionado.codigo}</div>
                <div class="qr" id="${idQR}"></div>
                <div class="info">
                    Saldo: ${produtoSelecionado.saldo} un.<br>
                    ${new Date().toLocaleDateString('pt-BR')}
                </div>
            </div>
        `;
    }

    htmlImpressao += `
        </body>
        <script>
            const dataQR = JSON.stringify({
                codigo: '${produtoSelecionado.codigo}',
                saldo: ${produtoSelecionado.saldo},
                data: '${new Date().toLocaleDateString('pt-BR')}'
            });

            for (let i = 0; i < ${quantidade}; i++) {
                const idQR = 'qr-' + i;
                new QRCode(document.getElementById(idQR), {
                    text: dataQR,
                    width: 150,
                    height: 150,
                    colorDark: "#001F5B",
                    colorLight: "#ffffff",
                    correctLevel: QRCode.CorrectLevel.H
                });
            }

            setTimeout(() => {
                window.print();
                window.close();
            }, 1000);
        <\/script>
    </html>
    `;

    janelaImpressao.document.write(htmlImpressao);
    janelaImpressao.document.close();
};

// ===== CARREGAR PRODUTOS =====
onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log("✅ Carregando produtos...");
        
        onSnapshot(collection(db, "usuarios", user.uid, "produtos"), (snapshot) => {
            todosProdutos = [];
            snapshot.forEach(doc => {
                todosProdutos.push({
                    codigo: doc.data().codigo || doc.id,
                    estoque_atual: doc.data().estoque_atual || 0
                });
            });
            
            todosProdutos.sort((a, b) => a.codigo.localeCompare(b.codigo));
            console.log("📦 Produtos carregados:", todosProdutos.length);
        });
    } else {
        console.log("❌ Usuário não logado!");
        window.location.href = "login.html";
    }
});