
    function gerarQR() {
        const codigo = document.getElementById('inputCodigo').value.trim().toUpperCase();
        if (!codigo) {
            alert("Por favor, digite um código!");
            return;
        }

        document.getElementById('labelCodigo').innerText = codigo;
        const qrContainer = document.getElementById('qrcode');
        qrContainer.innerHTML = ""; // Limpa anterior

        new QRCode(qrContainer, {
            text: codigo,
            width: 180,
            height: 180,
            colorDark : "#000000",
            colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.H
        });
    }