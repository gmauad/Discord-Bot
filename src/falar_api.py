import asyncio
import edge_tts
import os
from flask import Flask, request, jsonify, send_file

app = Flask(__name__)

print("[SISTEMA] TTS API ONLINE na porta 5000")

@app.route('/falar', methods=['POST'])
def gerar_voz():
    texto = ""
    
    # Processa independentemente do cabeçalho de envio (JSON, Form ou Text)
    if request.is_json:
        dados = request.json
        if dados:
            texto = dados.get('texto', '')
    elif request.form:
        texto = request.form.get('texto', '')
    
    if not texto and request.data:
        texto = request.data.decode('utf-8', errors='ignore')

    if not texto.strip():
        print("[AVISO] Payload vazio recebido na rota TTS.")
        return jsonify({"erro": "Parâmetro de texto ausente"}), 400
        
    print(f"[GERANDO ÁUDIO]: {texto}")
    
    # Modelo de voz (Pode ser alterado para pt-BR-FranciscaNeural, etc.)
    voz = "pt-BR-AntonioNeural" 
    caminho_saida = "resposta_tts.mp3"

    async def run_tts():
        communicate = edge_tts.Communicate(texto.strip(), voz, rate="+15%")
        await communicate.save(caminho_saida)

    try:
        asyncio.run(run_tts())
        return send_file(caminho_saida, mimetype="audio/mpeg")
    except Exception as e:
        print(f"[ERRO] Falha interna TTS: {e}")
        return jsonify({"erro": str(e)}), 500

if __name__ == '__main__':
    app.run(port=5000)