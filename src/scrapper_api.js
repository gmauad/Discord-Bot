const express = require('express');
const axios = require('axios');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const app = express();
const PORT = 3000;

async function buscarGoogle(query) {
    console.log(`[MOTOR A] Executando busca via Google Custom Search...`);
    const apiKey = process.env.GOOGLE_API_KEY;
    const cx = process.env.GOOGLE_CX;
    
    if (!apiKey || !cx) throw new Error("Chaves do Google ausentes no .env");

    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}&hl=pt-BR`;
    const response = await axios.get(url);
    
    let extraidos = [];
    if (response.data.items) {
        extraidos = response.data.items.slice(0, 5).map(item => ({
            titulo: item.title,
            resumo: item.snippet
        }));
    }
    return extraidos;
}

async function buscarSerper(query) {
    console.log(`[MOTOR B] Executando busca via Serper.dev...`);
    const apiKey = process.env.SERPER_API_KEY;
    
    if (!apiKey) throw new Error("Chave do Serper ausente no .env");

    const data = JSON.stringify({ q: query, gl: "br", hl: "pt-br" });
    const config = {
        method: 'post',
        url: 'https://google.serper.dev/search',
        headers: { 
            'X-API-KEY': apiKey, 
            'Content-Type': 'application/json'
        },
        data: data
    };

    const response = await axios(config);
    let extraidos = [];
    
    // Filtro semântico/SEO de exemplo. Customize de acordo com a necessidade do projeto.
    const validarRelevancia = (titulo, queryOriginal) => {
        const titleLower = titulo.toLowerCase();
        const queryLower = queryOriginal.toLowerCase();

        // Exemplo: Restringir resultados indesejados (peças, acessórios genéricos, etc)
        const blocklistSEO = ['compatível', 'espelho', 'adesivo', 'suporte', 'caixa'];
        for (let palavra of blocklistSEO) {
            if (titleLower.includes(palavra)) return false;
        }

        // Validação estrita de numerais
        const numerosBusca = queryLower.match(/\d{4}/g); 
        if (numerosBusca) {
            for (let num of numerosBusca) {
                if (!titleLower.includes(num)) return false;
            }
        }

        return true;
    };

    if (response.data.answerBox && validarRelevancia(response.data.answerBox.title || '', query)) {
        extraidos.push({
            titulo: `[RESPOSTA DIRETA] ${response.data.answerBox.title || 'Informação'}`,
            resumo: response.data.answerBox.answer || response.data.answerBox.snippet
        });
    }

    if (response.data.shopping) {
        let itensShopping = [];

        response.data.shopping.forEach(item => {
            if (!validarRelevancia(item.title, query)) return;

            let precoNum = 999999;
            if (item.price) {
                const limpo = item.price.replace(/[^\d,\.]/g, '').replace(/\./g, '').replace(',', '.');
                precoNum = parseFloat(limpo);
            }

            itensShopping.push({
                titulo: `[LOJA: ${item.source}] ${item.title}`,
                resumo: `Preço: ${item.price}`,
                precoMatematico: isNaN(precoNum) ? 999999 : precoNum
            });
        });

        itensShopping.sort((a, b) => a.precoMatematico - b.precoMatematico);
        itensShopping.slice(0, 3).forEach(item => {
            extraidos.push({ titulo: item.titulo, resumo: item.resumo });
        });
    }

    if (response.data.organic) {
        response.data.organic.forEach(item => {
            if (!validarRelevancia(item.title, query)) return;
            if (extraidos.length < 6) {
                extraidos.push({ titulo: item.title, resumo: item.snippet });
            }
        });
    }
    
    return extraidos;
}

app.get('/buscar', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.status(400).json({ erro: "Parâmetro 'q' ausente na requisição." });

    const motorSelecionado = process.env.MOTOR_DE_BUSCA || 'SERPER';
    console.log(`\n[API] Requisição de busca recebida: "${query}"`);

    try {
        let resultados = [];

        if (motorSelecionado === 'GOOGLE') {
            resultados = await buscarGoogle(query);
        } else {
            resultados = await buscarSerper(query);
        }

        console.log(`[API] Sucesso! ${resultados.length} resultados processados e devolvidos ao Gateway.`);
        res.json({ resultados });

    } catch (erro) {
        console.error(`[API] Falha de processamento: ${erro.message}`);
        res.status(500).json({ erro: "A API de scraping falhou.", detalhe: erro.message });
    }
});

app.listen(PORT, () => {
    console.log(`[SYS] Scraper API Online (Porta ${PORT})`);
    console.log(`[CFG] Motor ativo: ${process.env.MOTOR_DE_BUSCA || 'SERPER'}`);
});